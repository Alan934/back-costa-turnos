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

export interface QueueEtaItem {
  appointmentId: string;
  personId: string;
  status: string;
  estimatedStartAt: string;
}

export interface QueueUpdatePayload {
  staffId: string;
  generatedAt: string;
  queue: QueueEtaItem[];
}

function room(staffId: string): string {
  return `staff:${staffId}`;
}

/**
 * Sala de espera en vivo. Los clientes se unen a la sala de un staff y reciben
 * el recalculo del ETA cada vez que la cola avanza. Usa el adapter Redis
 * (configurado en main.ts) para funcionar con multiples instancias.
 */
@WebSocketGateway({ namespace: '/waiting-room', cors: { origin: '*' } })
export class WaitingRoomGateway implements OnGatewayConnection {
  private readonly logger = new Logger(WaitingRoomGateway.name);

  @WebSocketServer()
  server!: Server;

  handleConnection(client: Socket): void {
    this.logger.debug(`Cliente conectado a sala de espera: ${client.id}`);
  }

  @SubscribeMessage('join')
  onJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { staffId: string },
  ): { joined: string } {
    void client.join(room(data.staffId));
    return { joined: data.staffId };
  }

  emitQueueUpdate(payload: QueueUpdatePayload): void {
    this.server?.to(room(payload.staffId)).emit('queue:update', payload);
  }
}
