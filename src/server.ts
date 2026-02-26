import express, { Request, Response } from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import { createClient } from 'redis';
import { TcpConnectionManager } from './bin/tcpManager';
import { idCoherent, startGlobalPoller, fetchBusLocation } from './bin/serverFunctions';
import 'dotenv/config';

const isDev = process.env.NODE_ENV !== 'production';
const allowedOrigin = isDev ? "*" : process.env.FRONT_URL;

const app = express();
app.use(cors({
    origin: allowedOrigin,
    methods: ['GET']
}));

const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: { origin: allowedOrigin }
});

const tcp = new TcpConnectionManager(
    process.env.BUS_TRACKER_API_SERVER ?? '',
    Number(process.env.BUS_TRACKER_API_PORT),
);

const redis = createClient({ url: 'redis://cache:6379' })
    .on('error', (err: Error) => console.error('[REDIS] Erreur :', err));

// --- LOGIQUE SOCKET.IO ---
io.on('connection', (socket: Socket) => {
    console.log(`[SOCKET] Nouveau client connecté : ${socket.id}`);

    socket.on('join_bus', async (busId: string) => {
        if (!idCoherent(busId)) return;

        socket.join(`bus:${busId}`);
        console.log(`[SOCKET] Client ${socket.id} suit le bus ${busId}`);

        // Envoi immédiat : depuis le cache si dispo, sinon TCP
        try {
            const data = await fetchBusLocation(busId, tcp, redis);
            socket.emit('busUpdate', data);
        } catch (err) {
            console.error(`[SOCKET] Première requête bus ${busId} échouée :`, (err as Error).message);
        }
    });

    socket.on('leave_bus', (busId: string) => {
        if (!idCoherent(busId)) return;
        socket.leave(`bus:${busId}`);
        console.log(`[SOCKET] Client ${socket.id} a quitté le bus ${busId}`);
    });

    socket.on('disconnect', () => {
        console.log(`[SOCKET] Client déconnecté : ${socket.id}`);
    });
});


app.get('/locate/:busId', async (req: Request, res: Response) => {
    console.log(`[EXPRESS] GET /locate/${req.params.busId}`);

    if (!idCoherent(req.params.busId)) {
        res.status(400).end();
        return;
    }

    try {
        const response = await fetchBusLocation(req.params.busId, tcp, redis);
        res.json(response);
    } catch (err: unknown) {
        if (err instanceof Error && err.message.includes('Timeout')) {
            res.status(404).end();
        } else {
            res.status(500).end();
        }
    }
});

app.get('/health', (_req: Request, res: Response) => {
    res.status(200).end();
});

// Tout le trafic qui n'est pas géré tombe ici
app.all('*', (_req: Request, res: Response) => {
    res.status(404).end();
});

redis.connect().then(() => {
    httpServer.listen(5000, () => {
        console.log(`[SERVER] Démarré sur http://localhost:5000`);
        startGlobalPoller(io, tcp, redis);
    });
});