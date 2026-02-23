import express, { Request, Response } from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import { createClient } from 'redis';
import { getInfo } from './bin/getInfo';
import { idCoherent, startPollingBus } from './bin/serverFunctions';
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

const redisClient = createClient({ url: 'redis://cache:6379' })
    .on('error', (err: Error) => console.error('Redis Client Error', err));

const activePollers = new Set<string>();

// --- LOGIQUE DE POLLING (LA BOUCLE) ---
io.on('connection', (socket: Socket) => {
    console.log(`[SOCKET] Nouveau client connecté : ${socket.id}`);

    socket.on('join_bus', async (busId: string) => {
        if (!idCoherent(busId)) return;

        socket.join(`bus:${busId}`);
        console.log(`[SOCKET] Client ${socket.id} suit le bus ${busId}`);

        const cached = await redisClient.get(`bus_cache:${busId}`);
        if (cached) {
            socket.emit('busUpdate', JSON.parse(cached));
        }

        startPollingBus(busId, io, redisClient, activePollers);
    });

    socket.on('disconnect', () => {
        console.log(`[SOCKET] Client déconnecté : ${socket.id}`);
    });
});


app.get('/locate/:busId', async (req: Request, res: Response) => {
    console.log(`[EXPRSS] GET /locate/${req.params.busId}`);

    if (!idCoherent(req.params.busId)) return;

    res.setHeader('Content-Type', 'application/json');
    try {
        const response = await getInfo(redisClient, req.params.busId);
        res.send(response);
    } catch (err: unknown) {
        if (err instanceof Error && err.name === 'TimeoutError') {
            res.status(404);
        } else {
            res.status(500);
        }
    }
});

// Tout le trafic qui n'est pas géré tombe ici
app.all('*', (_req: Request, res: Response) => {
    res.status(404);
});

redisClient.connect().then(() => {
    httpServer.listen(5000, () => {
        console.log(`[SERVER] Démarré sur http://localhost:5000`);
    });
});