// src/socket/socket-client.service.ts

import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { io, Socket } from 'socket.io-client';
import { Instance, ListMessage } from './type';

@Injectable()
export class WhatsappService implements OnModuleInit, OnModuleDestroy {
  private sockets: Map<string, Socket> = new Map();
  private host: string;
  private port: string;

  async onModuleInit() {
    this.host = process.env.HOST || 'localhost';
    this.port = process.env.PORT || '8080';

    const instances = await this.fetchInstances();

    // Criar um socket para cada instância
    if (instances && instances.length > 0) {
      for (const instance of instances) {
        await this.createSocketForInstance(instance);
      }
    }
  }

  private async createSocketForInstance(instance: Instance) {
    const instanceName = instance.name;
    console.log(`Criando socket para instância: ${instanceName}`);

    const socket = io(`http://${this.host}:${this.port}/${instanceName}`, {
      reconnection: true,
      timeout: 10000,
      transports: ['websocket'],
    });

    this.sockets.set(instanceName, socket);
    this.registerEventsForSocket(socket, instanceName);
  }

  private registerEventsForSocket(socket: Socket, instanceName: string) {
    socket.on('connect', () => {
      console.log(
        `✅ Conectado ao Evolution WhatsApp - Instância: ${instanceName}`,
      );
    });

    socket.on('connect_error', (error) => {
      console.error(
        `❌ Erro de conexão na instância ${instanceName}:`,
        error.message,
      );
    });

    socket.on('disconnect', (reason) => {
      console.warn(`⚠️ Desconectado da instância ${instanceName}:`, reason);
      9;
    });

    socket.on('messages.upsert', (data) => {
      console.log(`📩 Nova mensagem na instância ${instanceName}:`, data);
    });
  }

  onModuleDestroy() {
    this.sockets.forEach((socket, instanceName) => {
      if (socket) {
        socket.disconnect();
        console.log(
          `🔌 Socket da instância ${instanceName} desconectado ao destruir o módulo.`,
        );
      }
    });
    this.sockets.clear();
  }

  async sendMessage({
    message,
    instanceName,
    to,
  }: {
    message: string;
    instanceName?: string;
    to?: string;
  }): Promise<any> {
    try {
      // Usar a instância especificada ou a primeira disponível
      const targetInstance = instanceName || this.sockets.keys().next().value;

      return await fetch(
        `http://${this.host}:${this.port}/message/sendText/${targetInstance}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: '429683C4C977415CAAFCCE10F7D57E11',
          },
          body: JSON.stringify({ text: message, number: to }),
        },
      ).then((data) => data.json());
    } catch (e) {
      console.error('❌ Erro ao enviar mensagem:', e);
      return { success: false, error: e.message };
    }
  }

  async sendListMessage(listMessage: ListMessage, instanceName?: string) {
    try {
      const targetInstance = instanceName || this.sockets.keys().next().value;

      const data = await fetch(
        `http://${this.host}:${this.port}/message/sendList/${targetInstance}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: '429683C4C977415CAAFCCE10F7D57E11',
          },
          body: JSON.stringify(listMessage),
        },
      ).then((data) => data.json());
      return data;
    } catch (e) {
      console.error('❌ Erro ao enviar mensagem:', e);
      return { success: false, error: e.message };
    }
  }

  // Método para obter o socket de uma instância específica
  getSocket(instanceName: string): Socket | undefined {
    return this.sockets.get(instanceName);
  }

  // Método para obter todas as instâncias com sockets
  getInstances(): string[] {
    return Array.from(this.sockets.keys());
  }

  async fetchInstances(): Promise<Instance[]> {
    try {
      return await fetch(
        `http://${this.host}:${this.port}/instance/fetchInstances`,
        {
          method: 'GET',
          headers: {
            apikey: '429683C4C977415CAAFCCE10F7D57E11',
          },
        },
      ).then((data) => data.json());
    } catch (e) {
      console.error('Erro ao buscar instâncias:', e);
      throw new Error(e);
    }
  }
}
