import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { WaitingRoomDto } from './dto/waiting-room.dto';

/** Snapshot completo de la sala: el cliente pinta lo que llega, sin recalcular nada. */
export interface RoomUpdatePayload {
  staffId: string;
  room: WaitingRoomDto;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Salas máximas por conexión (incluye la sala propia que Socket.IO crea con el id). */
const MAX_ROOMS_PER_CLIENT = 5;

function room(staffId: string): string {
  return `staff:${staffId}`;
}

/**
 * Sala de espera en vivo. Los clientes (la pantalla del local, el celular de
 * cada persona en la fila y el panel del profesional) se unen a la sala de un
 * staff y reciben el snapshot completo cada vez que la cola cambia. Usa el
 * adapter Redis (configurado en main.ts) para funcionar con varias instancias.
 *
 * Los nombres de evento y el namespace son parte del contrato con el front
 * (ver `src/lib/realtime/events.ts`): `waiting-room:join` / `waiting-room:update`.
 */
// CORS: lo fija RedisIoAdapter con CORS_ORIGINS (no se declara acá para no abrirlo a '*').
@WebSocketGateway({ namespace: '/waiting-room' })
export class WaitingRoomGateway implements OnGatewayConnection {
  private readonly logger = new Logger(WaitingRoomGateway.name);

  @WebSocketServer()
  server!: Server;

  handleConnection(client: Socket): void {
    this.logger.debug(`Cliente conectado a sala de espera: ${client.id}`);
  }

  @SubscribeMessage('waiting-room:join')
  onJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { staffId?: unknown },
  ): { joined: string } {
    // Entrada no confiable: solo UUIDs, y un tope de salas por conexión (la sala es pública
    // pero no queremos que un cliente se suscriba a miles).
    const staffId = typeof data?.staffId === 'string' ? data.staffId : '';
    if (!UUID_RE.test(staffId)) throw new WsException('staffId inválido');
    if (client.rooms.size > MAX_ROOMS_PER_CLIENT) throw new WsException('Demasiadas salas');
    void client.join(room(staffId));
    return { joined: staffId };
  }

  emitRoomUpdate(payload: RoomUpdatePayload): void {
    this.server?.to(room(payload.staffId)).emit('waiting-room:update', payload);
  }
}
