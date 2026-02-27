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

// Utilisation de la variable d'env REDIS_URL si elle existe, sinon fallback sur le nom du service K8s
const redisUrl = process.env.REDIS_URL || 'redis://redis:6379';
const redis = createClient({ url: redisUrl })
    .on('error', (err: Error) => console.error('[REDIS] Erreur :', err));

// --- LOGIQUE SOCKET.IO ---
io.on('connection', (socket: Socket) => {
    console.log(`[SOCKET] Nouveau client connecté : ${socket.id}`);

    socket.on('join_bus', async (busId: string) => {
        if (!idCoherent(busId)) return;

        socket.join(`bus:${busId}`);
        console.log(`[SOCKET] Client ${socket.id} suit le bus ${busId}`);

        if (tcp.isPaused()) {
            tcp.resume();
        }

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

// 1. Health Check sur "/" pour Kubernetes (car ta sonde tape sur "/")
app.get('/', (_req: Request, res: Response) => {
    res.status(200).send('OK');
});

app.get('/health', (_req: Request, res: Response) => {
    res.status(200).send('OK');
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

app.all('*', (_req: Request, res: Response) => {
    res.status(404).end();
});

const PORT = 5000;
const HOST = '0.0.0.0'; 

redis.connect().then(() => {
    httpServer.listen(PORT, HOST, () => {
        console.log(`[SERVER] Démarré et accessible sur http://${HOST}:${PORT}`);
        startGlobalPoller(io, tcp, redis);
    });
});