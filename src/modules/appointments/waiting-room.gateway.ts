import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { WaitingRoomDto } from './dto/waiting-room.dto';

/** Snapshot completo de la sala: el cliente pinta lo que llega, sin recalcular nada. */
export interface RoomUpdatePayload {
  staffId: string;
  room: WaitingRoomDto;
}

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
@WebSocketGateway({ namespace: '/waiting-room', cors: { origin: '*' } })
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
    @MessageBody() data: { staffId: string },
  ): { joined: string } {
    void client.join(room(data.staffId));
    return { joined: data.staffId };
  }

  emitRoomUpdate(payload: RoomUpdatePayload): void {
    this.server?.to(room(payload.staffId)).emit('waiting-room:update', payload);
  }
}
