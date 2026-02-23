import { Server } from 'socket.io';
import { getInfo, RedisClient } from './getInfo';

export function idCoherent(busId: string): boolean {
    if (!/^\d+$/.test(busId) || busId.length === 0 || busId.length >= 4) {
        return false;
    }
    return true;
}

export async function startPollingBus(busId: string, io: Server, redisClient: RedisClient, activePollers: Set<string>) {
    if (activePollers.has(busId)) return;
    activePollers.add(busId);

    console.log(`[POLLER] Démarrage du flux pour le bus ${busId}`);

    while (activePollers.has(busId)) {
        // Vérifier si des clients écoutent encore
        const roomSize = io.sockets.adapter.rooms.get(`bus:${busId}`)?.size || 0;

        if (roomSize === 0) {
            console.log(`[POLLER] Plus de clients pour le bus ${busId}. Arrêt.`);
            activePollers.delete(busId);
            break;
        }

        try {
            const data = await getInfo(redisClient, busId);
            io.to(`bus:${busId}`).emit('busUpdate', data);
        } catch (err) {
            console.error(`[POLLER] Erreur bus ${busId}:`, err);
        }

        await new Promise(resolve => setTimeout(resolve, 6000)); // 6 sec
    }
}
