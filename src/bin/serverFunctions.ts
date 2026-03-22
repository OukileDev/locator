import { Server } from 'socket.io';
import { createClient } from 'redis';
import { TcpConnectionManager, BusLocation } from './tcpManager';

export type RedisClient = ReturnType<typeof createClient>;

export function idCoherent(busId: string): boolean {
    if (!/^\d+$/.test(busId) || busId.length === 0 || busId.length >= 4) {
        return false;
    }
    return true;
}

const POLL_INTERVAL_MS = 10000;
// TTL du cache légèrement supérieur à l'intervalle de polling
const CACHE_TTL_S = POLL_INTERVAL_MS / 1000 + 2;
const CACHE_PREFIX = 'bus:';

/**
 * Récupère la position d'un bus :
 * - Depuis Redis si une valeur fraîche existe (< 13s)
 * - Sinon depuis le serveur TCP, puis met en cache
 */
export async function fetchBusLocation(
    busId: string,
    tcp: TcpConnectionManager,
    redis: RedisClient,
): Promise<BusLocation> {
    const cached = await redis.get(`${CACHE_PREFIX}${busId}`);
    if (cached) {
        return JSON.parse(cached) as BusLocation;
    }

    const data = await tcp.request(busId);
    await redis.set(`${CACHE_PREFIX}${busId}`, JSON.stringify(data), { EX: CACHE_TTL_S });
    return data;
}

/**
 * Démarre la boucle globale de polling.
 * Un seul setInterval tourne pour tous les bus actifs.
 * Toutes les requêtes TCP sont envoyées en parallèle (le serveur répond avec le busID).
 * Quand aucun bus n'est suivi, le client TCP est mis en veille pour éviter les
 * déconnexions/reconnexions intempestives. Il reprend dès qu'un bus est à nouveau suivi.
 */
export function startGlobalPoller(io: Server, tcp: TcpConnectionManager, redis: RedisClient): void {
    console.log('[POLLER] Démarrage de la boucle globale.');

    setInterval(async () => {
        const rooms = io.sockets.adapter.rooms;
        const busRooms = [...rooms.keys()].filter(r => r.startsWith('bus:'));

        if (busRooms.length === 0) {
            if (!tcp.isPaused()) {
                tcp.pause();
            }
            return;
        }

        // Des bus sont actifs : on s'assure que le TCP est bien réveillé
        if (tcp.isPaused()) {
            tcp.resume();
        }

        console.log(`[POLLER] Cycle : ${busRooms.length} bus à interroger.`);

        // Toutes les requêtes partent en parallèle
        await Promise.allSettled(
            busRooms.map(async (room) => {
                const busId = room.replace('bus:', '');
                if ((rooms.get(room)?.size ?? 0) === 0) return;

                try {
                    const data = await fetchBusLocation(busId, tcp, redis);
                    io.to(room).emit('busUpdate', data);
                } catch (err) {
                    console.error(`[POLLER] Erreur bus ${busId} :`, (err as Error).message);
                }
            })
        );
    }, POLL_INTERVAL_MS);
}
