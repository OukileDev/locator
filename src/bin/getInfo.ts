import * as net from 'net';
import { createClient } from 'redis';
import { parseString } from 'xml2js';

interface BusPositionXml {
    evBusPos_v1: {
        BusId: string[];
        Y: string[];
        X: string[];
    };
}

interface BusLocation {
    busID: string;
    Lat: string;
    Lon: string;
}

export type RedisClient = ReturnType<typeof createClient>;

export async function getInfo(client: RedisClient, key: string): Promise<BusLocation> {

    return new Promise<BusLocation>((resolve, reject) => {
        const tcpClient = new net.Socket();
        let settled = false;

        const timeout = setTimeout(() => {
            if (!settled) {
                settled = true;
                tcpClient.destroy();
                const err = new Error(`Timeout: aucune réponse pour le bus ID "${key}" après 500ms`);
                err.name = 'TimeoutError';
                reject(err);
            }
        }, 500);

        tcpClient.connect(
            Number(process.env.BUS_TRACKER_API_PORT),
            process.env.BUS_TRACKER_API_SERVER ?? '',
            () => {
                tcpClient.write(
                    `<?xml version="1.0" encoding="utf-8"?><evGetBusPos_v1><BusId>${key}</BusId></evGetBusPos_v1>`
                );
            }
        );

        tcpClient.on('data', (data: Buffer) => {
            if (settled) return;
            const raw = data.toString();

            parseString(raw, (err: Error | null, result: BusPositionXml) => {
                if (err) {
                    console.error('Erreur de parsing XML :', err);
                    if (!settled) {
                        settled = true;
                        clearTimeout(timeout);
                        reject(err);
                    }
                    return;
                }

                const busData = result.evBusPos_v1;
                const response: BusLocation = {
                    busID: busData.BusId[0],
                    Lat: busData.Y[0],
                    Lon: busData.X[0],
                };

                client.set(key, JSON.stringify(response));
                client.expire(key, 6);
                settled = true;
                clearTimeout(timeout);
                resolve(response);
                tcpClient.destroy();
            });
        });

        tcpClient.on('error', (err: Error) => {
            console.error('Erreur TCP :', err);
            if (!settled) {
                settled = true;
                clearTimeout(timeout);
                reject(err);
            }
        });
    });
}
