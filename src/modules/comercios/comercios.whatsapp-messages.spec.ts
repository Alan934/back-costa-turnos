import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { normalizeWhatsappMessages } from './comercios.service';
import { UpdateMembershipDto } from './dto/comercio.dto';

describe('mensajes de WhatsApp de la sala', () => {
  describe('normalizeWhatsappMessages', () => {
    it('null o vacío → null (todo por defecto)', () => {
      expect(normalizeWhatsappMessages(null)).toBeNull();
      expect(normalizeWhatsappMessages({})).toBeNull();
    });

    it('descarta claves vacías o en blanco y recorta el resto', () => {
      expect(
        normalizeWhatsappMessages({ called: '  Pasá ahora  ', next: '   ', waiting: '' }),
      ).toEqual({ called: 'Pasá ahora' });
    });

    it('todo en blanco → null', () => {
      expect(normalizeWhatsappMessages({ called: ' ', next: '\n' })).toBeNull();
    });

    it('ignora claves desconocidas', () => {
      const input = { next: 'Hola', other: 'x' } as never;
      expect(normalizeWhatsappMessages(input)).toEqual({ next: 'Hola' });
    });
  });

  describe('UpdateMembershipDto.waitingRoomWhatsappMessages', () => {
    const check = (body: unknown) =>
      validate(plainToInstance(UpdateMembershipDto, body), { whitelist: true });

    it('acepta mensajes parciales y null', async () => {
      expect(
        await check({ waitingRoomWhatsappMessages: { called: 'Hola {nombre}' } }),
      ).toHaveLength(0);
      expect(await check({ waitingRoomWhatsappMessages: null })).toHaveLength(0);
      expect(await check({})).toHaveLength(0);
    });

    it('rechaza un mensaje de más de 1000 caracteres', async () => {
      const errors = await check({ waitingRoomWhatsappMessages: { next: 'a'.repeat(1001) } });
      expect(errors).not.toHaveLength(0);
    });

    it('rechaza valores que no son texto', async () => {
      const errors = await check({ waitingRoomWhatsappMessages: { waiting: 42 } });
      expect(errors).not.toHaveLength(0);
    });
  });
});
