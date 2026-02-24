import * as net from 'net';
import { parseString } from 'xml2js';

interface BusPositionXml {
    evBusPos_v1: {
        BusId: string[];
        Y: string[];
        X: string[];
    };
}

export interface BusLocation {
    busID: string;
    lat: string;
    lon: string;
}

interface PendingRequest {
    resolve: (data: BusLocation) => void;
    reject: (err: Error) => void;
    timer: ReturnType<typeof setTimeout>;
}
const XML_HEADER = '<?xml version="1.0" encoding="utf-8"?>';

export class TcpConnectionManager {
    private socket: net.Socket | null = null;
    private connected = false;
    private destroyed = false;

    // Requêtes en attente de réponse, indexées par busId
    private pending = new Map<string, PendingRequest>();
    // Requêtes mises en attente avant que la connexion soit prête
    private queue: Array<() => void> = [];

    private buffer = '';

    constructor(
        private readonly host: string,
        private readonly port: number,
    ) {
        this.connect();
    }

    // -------------------------------------------------------------------------
    // Connexion / reconnexion
    // -------------------------------------------------------------------------

    private connect(): void {
        if (this.destroyed) return;

        this.socket = new net.Socket();
        this.buffer = '';

        this.socket.connect(this.port, this.host, () => {
            console.log(`[TCP] Connecté à ${this.host}:${this.port}`);
            this.connected = true;
            // Vider la file des requêtes en attente de connexion
            const queued = [...this.queue];
            this.queue = [];
            queued.forEach(fn => fn());
        });

        this.socket.on('data', (data: Buffer) => this.onData(data));

        this.socket.on('error', (err: Error) => {
            console.error('[TCP] Erreur :', err.message);
            this.handleDisconnect();
        });

        this.socket.on('close', () => {
            console.warn('[TCP] Connexion fermée.');
            this.handleDisconnect();
        });
    }

    private handleDisconnect(): void {
        this.connected = false;

        // Rejeter toutes les requêtes en attente
        for (const [busId, req] of this.pending) {
            clearTimeout(req.timer);
            req.reject(new Error(`[TCP] Connexion perdue (bus ${busId})`));
        }
        this.pending.clear();

        if (!this.destroyed) {
            console.log(`[TCP] Reconnexion dans 3s...`);
            setTimeout(() => this.connect(), 3000);
        }
    }

    // -------------------------------------------------------------------------
    // Envoi de requête publique
    // -------------------------------------------------------------------------

    request(busId: string): Promise<BusLocation> {
        return new Promise<BusLocation>((resolve, reject) => {
            // Si une requête est déjà en vol pour ce bus, on se greffe dessus
            if (this.pending.has(busId)) {
                const existing = this.pending.get(busId)!;
                const originalResolve = existing.resolve;
                const originalReject = existing.reject;
                existing.resolve = (data) => { originalResolve(data); resolve(data); };
                existing.reject  = (err)  => { originalReject(err);  reject(err);  };
                return;
            }

            const send = () => {
                if (this.destroyed) {
                    reject(new Error('TcpConnectionManager détruit'));
                    return;
                }

                const timer = setTimeout(() => {
                    console.warn(`[TCP] Timeout pour le bus ${busId}`);
                    this.pending.delete(busId);
                    reject(new Error(`Timeout: aucune réponse pour le bus "${busId}"`));
                }, 5000);

                this.pending.set(busId, { resolve, reject, timer });

                const xml = `${XML_HEADER}<evGetBusPos_v1><BusId>${busId}</BusId></evGetBusPos_v1>`;
                this.socket!.write(xml);
            };

            if (this.connected) {
                send();
            } else {
                this.queue.push(send);
            }
        });
    }

    // -------------------------------------------------------------------------
    // Réception et parsing
    // -------------------------------------------------------------------------

    private onData(data: Buffer): void {
        this.buffer += data.toString();

        // Le buffer peut contenir plusieurs réponses concaténées — on les extrait toutes
        let closeIdx: number;
        while ((closeIdx = this.buffer.indexOf('</evBusPos_v1>')) !== -1) {
            const end = closeIdx + '</evBusPos_v1>'.length;
            const raw = this.buffer.slice(0, end);
            this.buffer = this.buffer.slice(end);
            this.parseResponse(raw);
        }
    }

    private parseResponse(raw: string): void {
        parseString(raw, (err: Error | null, result: BusPositionXml) => {
            if (err) {
                console.error('[TCP] Erreur de parsing XML :', err.message);
                return;
            }

            const d = result.evBusPos_v1;
            const busId = d.BusId[0];
            const req = this.pending.get(busId);

            if (!req) {
                console.warn(`[TCP] Réponse reçue pour le bus ${busId} sans requête en attente, ignorée.`);
                return;
            }

            clearTimeout(req.timer);
            this.pending.delete(busId);

            req.resolve({
                busID: busId,
                lat: d.Y[0],
                lon: d.X[0],
            });
        });
    }

    // -------------------------------------------------------------------------
    // Arrêt propre
    // -------------------------------------------------------------------------

    destroy(): void {
        this.destroyed = true;
        this.socket?.destroy();
    }
}
