# Cambios del backend para el front — Turnerito

Documento de handoff para el agente del **backend**. Resume mejoras opcionales que el front aprovecharía.

> ✅ **IMPLEMENTADO en el back (Mejoras A y B).** El `day-availability` ya expone
> `freeSlots` / `totalSlots` / `occupancyRatio` y `timeOffType`, y el `time_off`
> acepta y guarda `type`. El `openapi.json` ya está regenerado. **El front puede
> borrar las dos heurísticas** (umbral relativo de "casi lleno" y el parseo de
> palabras clave de `reason`). Detalle de cada campo abajo.

---

## 1. Agenda pública: datos para colorear días y horarios

**Contexto.** En la página pública (`/r/:slug`, paso "Elegí día y hora") el front ahora colorea cada día y cada horario según su estado, para que el cliente identifique de un vistazo dónde puede reservar. Hoy todo eso funciona con los datos actuales, pero **dos cosas se resuelven con heurísticas en el front** porque el back no las expone. Si el back las provee, el front las reemplaza por datos exactos (hay comentarios en el código marcando dónde).

> ⚠️ **Nada de esto es bloqueante.** La agenda ya está en producción y se ve bien. Esto es un "nice to have" para mayor precisión.

### Estado actual (lo que el back ya devuelve)

`GET /r/:slug/professionals/:membershipId/day-availability` (y la variante por servicio) devuelve `DayAvailabilityDto[]`:

```ts
{ date: "YYYY-MM-DD", status: "available" | "closed" | "time_off" | "full", reason?: string | null, bookable: boolean }
```

Y `GET .../slots` devuelve **solo los huecos libres**.

---

### Mejora A — Ocupación por día (para "casi lleno" preciso)

**Hoy (heurística del front):** marco un día como **"Quedan pocos"** cuando tiene ≤25% de los huecos libres del día más cargado del rango visible. Es relativo y aproximado.

**Pedido:** que `DayAvailabilityDto` incluya, por día, cuántos huecos hay en total y cuántos quedan libres. Con eso el front muestra el dato real ("quedan 2 de 10") y el umbral de "casi lleno" deja de ser una estimación.

```ts
// DayAvailabilityDto — campos nuevos sugeridos:
freeSlots: number;    // huecos libres ese día
totalSlots: number;   // capacidad total del día (libres + ocupados)
// (opcional, si es más cómodo calcularlo en el back)
occupancyRatio?: number; // 0..1 = ocupados / totalSlots
```

✅ **Implementado.** `DayAvailabilityDto` ahora trae **los tres** campos (no opcionales):

```ts
freeSlots: number;       // huecos reservables ese día (0 si no es bookable)
totalSlots: number;      // capacidad ofertada = libres + ocupados por reserva.
                         // Descuenta descansos y time_off (no son "ocupados", es
                         // tiempo no atendido). 0 cuando status=closed.
occupancyRatio: number;  // 0..1 = (totalSlots - freeSlots) / totalSlots; 0 si total=0.
                         // status=full => 1; status=available => < 1.
```

Para el servicio "cualquiera" (`services/:serviceId/day-availability`) los conteos
vienen **agregados** entre los profesionales que ofrecen el servicio (suma de
`freeSlots`/`totalSlots`, ratio recalculado sobre el total combinado). "Quedan 2 de
10" sale directo de `freeSlots`/`totalSlots`.

---

### Mejora B — Tipar el motivo de `time_off` (feriado / vacaciones / bloqueo)

**Hoy (heurística del front):** cuando `status = "time_off"`, separo **Feriado**, **Vacaciones** y **Bloqueo** leyendo palabras clave del texto libre `reason` (busco "feriad…", "vacac…", etc.). Si el profesional escribe "asueto" o "me voy de viaje", cae en "Bloqueado" genérico.

**Pedido:** un campo tipado con el tipo de ausencia, además del `reason` libre (que se sigue mostrando como detalle).

```ts
// DayAvailabilityDto / TimeOff — campo nuevo sugerido:
timeOffType?: "holiday" | "vacation" | "block"; // feriado | vacaciones | bloqueo
// reason sigue existiendo como texto libre opcional para el detalle.
```

Idealmente el enum se carga al crear/editar el `time_off` (un selector en el panel del profesional), y se propaga al `day-availability` público.

✅ **Implementado.** Enum `TimeOffType = "holiday" | "vacation" | "block"`:

- **Crear bloqueo:** `POST .../time-off` acepta `type?` en el body (`CreateTimeOffDto`).
  Si se omite, default `"block"`. El selector del panel del profesional manda este campo.
- **Entidad `TimeOff`:** nueva columna `type` (se devuelve en `GET .../time-off`).
  Los bloqueos previos a la migración quedan en `"block"`.
- **`day-availability` público:** cuando `status="time_off"`, el DTO trae
  `timeOffType: "holiday" | "vacation" | "block"` (en otros estados es `null`).
  `reason` sigue siendo el texto libre para el detalle. Ya no hace falta parsear
  palabras clave.

---

### Resumen para el back

| Mejora | Campo nuevo | Dónde | Beneficio en el front | Estado |
|---|---|---|---|---|
| A | `freeSlots`, `totalSlots`, `occupancyRatio` | `DayAvailabilityDto` | "Casi lleno" exacto en vez de estimado | ✅ Hecho |
| B | `type` (entrada) / `timeOffType` (salida): `"holiday" \| "vacation" \| "block"` | `CreateTimeOffDto` + `TimeOff` / `DayAvailabilityDto` | Color de feriado/vacaciones/bloqueo 100% confiable | ✅ Hecho |

`openapi.json` ya regenerado (`packages/contract/openapi.json`). El front puede
correr orval y **borrar las dos heurísticas**.
