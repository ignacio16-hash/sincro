// Guía para vendedor: explica cómo funciona /orders.
// Pensada solo para rol "vendedor" (gating en proxy.ts + Sidebar.tsx).
// Estilo: el mismo minimalista del resto de la app — uppercase tracking,
// border negro, fuentes ligeras. No fetch ni estado: contenido estático.

import Link from "next/link";

const num = (i: number) => String(i + 1).padStart(2, "0");

// ─── Glosarios de estados ────────────────────────────────────────────────────
// Tomados de app/(app)/orders/page.tsx (FALABELLA_STATE_ES, RIPLEY_STATE_ES) y
// del OpenAPI de Cencosud para Paris. Si cambian allá, actualizar acá.

const FALABELLA_GLOSARIO: { code: string; es: string; desc: string }[] = [
  { code: "pending", es: "Pendiente", desc: "El pedido entró pero todavía no se prepara. Hay que descargar el ticket y dejarlo listo para despachar." },
  { code: "ready_to_ship", es: "Listo para envío", desc: "Falabella confirmó que el paquete está listo. La transportista pasa a buscarlo." },
  { code: "shipped", es: "Enviado", desc: "La transportista ya retiró el paquete y va en camino al cliente." },
  { code: "delivered", es: "Entregado", desc: "El cliente recibió el paquete. No hay nada más que hacer." },
  { code: "canceled", es: "Cancelado", desc: "El pedido fue cancelado (por el cliente, por Falabella o por nosotros). No despachar." },
  { code: "returned", es: "Devuelto", desc: "El cliente devolvió el producto." },
  { code: "failed", es: "Fallido", desc: "Algo salió mal con el pedido. Revisar con el admin." },
];

const RIPLEY_GLOSARIO: { code: string; es: string; desc: string }[] = [
  { code: "STAGING", es: "Borrador", desc: "Ripley todavía no confirma el pedido. No hacer nada." },
  { code: "WAITING_ACCEPTANCE", es: "Esperando aceptación", desc: "Falta que el cliente confirme. No despachar todavía." },
  { code: "WAITING_DEBIT", es: "Esperando pago", desc: "Pago en proceso. No despachar." },
  { code: "SHIPPING", es: "En preparación", desc: "Pedido confirmado, listo para preparar y descargar el ticket." },
  { code: "SHIPPED", es: "Enviado", desc: "Ya despachado por la transportista." },
  { code: "TO_COLLECT", es: "Por recoger", desc: "El cliente eligió retiro en tienda; está esperando que pase a buscarlo." },
  { code: "RECEIVED", es: "Recibido", desc: "El cliente ya tiene el paquete." },
  { code: "CLOSED", es: "Cerrado", desc: "Pedido finalizado. No requiere acción." },
  { code: "REFUSED", es: "Rechazado", desc: "Pedido rechazado por Ripley o por el cliente." },
  { code: "CANCELED", es: "Cancelado", desc: "Cancelado por alguna de las partes. No despachar." },
  { code: "REFUNDED", es: "Reembolsado", desc: "Se devolvió el dinero al cliente." },
  { code: "INCIDENT_OPEN", es: "Incidencia abierta", desc: "Hay un problema reportado. Avisar al admin." },
];

// Paris devuelve el estado en español/inglés mezclado dependiendo del carrier.
// Acá agrupamos las palabras clave que la app usa para decidir si un item está
// "abierto" (cuenta para el badge) o "cerrado".
const PARIS_GLOSARIO: { code: string; es: string; desc: string; abierto: boolean }[] = [
  { code: "pending / pendiente", es: "Pendiente", desc: "Paris recibió el pedido, hay que prepararlo y descargar el ticket.", abierto: true },
  { code: "preparing / preparando", es: "Preparando", desc: "Item en preparación de tu lado.", abierto: true },
  { code: "ready / listo", es: "Listo para despacho", desc: "Listo para que pase la transportista.", abierto: true },
  { code: "shipped / enviado", es: "Enviado", desc: "Ya retirado por la transportista.", abierto: false },
  { code: "delivered / entregado", es: "Entregado", desc: "Cliente lo recibió.", abierto: false },
  { code: "cancelled / cancelado", es: "Cancelado", desc: "No despachar.", abierto: false },
  { code: "returned / devuelto", es: "Devuelto", desc: "Cliente devolvió el producto.", abierto: false },
];

// ─── Helpers de UI ───────────────────────────────────────────────────────────

function Section({
  index,
  title,
  subtitle,
  children,
}: {
  index: number;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-10 lg:mb-14">
      <div className="flex items-baseline gap-4 mb-5 pb-3 border-b border-black">
        <span className="font-mono text-xs font-bold tracking-[0.2em] text-neutral-400">
          {num(index)}
        </span>
        <div>
          <h2 className="text-lg lg:text-xl font-bold tracking-[0.15em] uppercase">{title}</h2>
          {subtitle && (
            <p className="text-[11px] font-light tracking-widest text-neutral-500 mt-1">{subtitle}</p>
          )}
        </div>
      </div>
      {children}
    </section>
  );
}

function StepCard({ n, title, body }: { n: number; title: string; body: React.ReactNode }) {
  return (
    <div className="border border-black p-5 flex gap-4">
      <span className="font-mono text-xs font-bold tracking-[0.2em] text-neutral-400 shrink-0">
        {num(n)}
      </span>
      <div>
        <p className="text-[11px] font-bold tracking-[0.25em] uppercase mb-2">{title}</p>
        <div className="text-xs font-light tracking-wider text-neutral-700 leading-relaxed">
          {body}
        </div>
      </div>
    </div>
  );
}

function Glossary({
  rows,
}: {
  rows: { code: string; es: string; desc: string; abierto?: boolean }[];
}) {
  return (
    <div className="border border-black divide-y divide-neutral-200">
      {rows.map((r) => (
        <div
          key={r.code}
          className="grid grid-cols-1 md:grid-cols-[180px_140px_1fr] gap-2 md:gap-4 px-4 py-3"
        >
          <span className="font-mono text-[11px] font-bold tracking-wider">{r.code}</span>
          <span className="text-[11px] font-bold tracking-[0.2em] uppercase text-neutral-700">
            {r.es}
            {r.abierto !== undefined && (
              <span
                className={
                  "ml-2 inline-block text-[9px] font-bold tracking-[0.2em] px-1.5 py-0.5 border " +
                  (r.abierto ? "border-black" : "border-neutral-300 text-neutral-400")
                }
              >
                {r.abierto ? "ABIERTO" : "CERRADO"}
              </span>
            )}
          </span>
          <span className="text-xs font-light tracking-wider text-neutral-700 leading-relaxed">
            {r.desc}
          </span>
        </div>
      ))}
    </div>
  );
}

// Diagrama SVG simple del layout de /orders. Mantiene la estética blanca/negra.
function LayoutDiagram() {
  return (
    <div className="border border-black p-6 bg-neutral-50">
      <svg viewBox="0 0 600 280" className="w-full h-auto" aria-label="Diagrama de la página de pedidos">
        {/* Header */}
        <rect x="20" y="20" width="560" height="40" fill="white" stroke="black" strokeWidth="1.5" />
        <text x="35" y="45" fontFamily="monospace" fontSize="13" fontWeight="bold">Pedidos</text>
        <text x="500" y="45" fontFamily="monospace" fontSize="10">Actualizar</text>
        <line x1="495" y1="50" x2="555" y2="50" stroke="black" strokeWidth="1" />

        {/* Tabs */}
        <rect x="20" y="80" width="560" height="32" fill="white" stroke="black" strokeWidth="1" />
        <text x="35" y="100" fontFamily="monospace" fontSize="10" fontWeight="bold">Ripley (3)</text>
        <text x="135" y="100" fontFamily="monospace" fontSize="10">Falabella (1)</text>
        <text x="240" y="100" fontFamily="monospace" fontSize="10">Shopify (2)</text>
        <text x="335" y="100" fontFamily="monospace" fontSize="10">Paris (4)</text>

        {/* Order card */}
        <rect x="20" y="130" width="560" height="130" fill="white" stroke="black" strokeWidth="1.5" />
        <rect x="20" y="130" width="560" height="32" fill="#fafafa" stroke="black" strokeWidth="1" />
        <text x="35" y="150" fontFamily="monospace" fontSize="10" fontWeight="bold">Orden # 1234567</text>
        <text x="160" y="150" fontFamily="monospace" fontSize="9" fill="#666">25 abr 2026</text>
        <rect x="500" y="138" width="70" height="18" fill="white" stroke="black" strokeWidth="1" />
        <text x="510" y="151" fontFamily="monospace" fontSize="8" fontWeight="bold">TICKET ENVÍO</text>

        {/* Item */}
        <rect x="35" y="175" width="50" height="50" fill="#f5f5f5" stroke="#ddd" />
        <text x="100" y="195" fontFamily="monospace" fontSize="10">Producto demo</text>
        <text x="100" y="210" fontFamily="monospace" fontSize="9" fill="#666">SKU · ABC-123</text>
        <text x="500" y="200" fontFamily="monospace" fontSize="14" fontWeight="bold">2</text>
        <text x="495" y="215" fontFamily="monospace" fontSize="8" fill="#666">UNIDADES</text>
      </svg>
    </div>
  );
}

// ─── Página ──────────────────────────────────────────────────────────────────

export default function GuiaPage() {
  return (
    <div className="px-4 sm:px-6 lg:px-10 py-6 lg:py-10 max-w-5xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-8 lg:mb-12 pb-6 border-b border-black">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold tracking-[0.15em]">Guía</h1>
          <p className="text-[11px] font-light tracking-widest text-neutral-500 mt-2">
            Cómo funciona la página de Pedidos
          </p>
        </div>
        <Link
          href="/orders"
          className="self-start text-xs font-bold tracking-[0.25em] underline underline-offset-[6px] hover:no-underline"
        >
          Ir a Pedidos →
        </Link>
      </div>

      {/* Intro */}
      <div className="mb-10 lg:mb-14 border border-black p-6">
        <p className="text-xs font-light tracking-wider leading-relaxed text-neutral-700">
          La página <strong className="font-bold">Pedidos</strong> es donde vas a ver todas las
          ventas que llegan desde Falabella, Ripley, Shopify y Paris. Desde ahí descargás el
          <strong className="font-bold"> ticket de envío</strong> de cada pedido y, en el caso
          de Shopify, marcás el pedido como <strong className="font-bold">enviado</strong> cuando lo despachás.
        </p>
      </div>

      {/* 01 — Tu día a día */}
      <Section
        index={0}
        title="Tu día a día"
        subtitle="La página NO se actualiza sola. Vos tenés que apretar Actualizar."
      >
        <div className="mb-5 border border-black p-5 bg-neutral-50">
          <p className="text-[11px] font-bold tracking-[0.25em] uppercase mb-2">Importante</p>
          <p className="text-xs font-light tracking-wider leading-relaxed text-neutral-700">
            Apretá <strong className="font-bold">Actualizar</strong> (arriba a la derecha)
            cada <strong className="font-bold">1 hora</strong>, desde que abrís la app
            por la mañana hasta las <strong className="font-bold">13:30</strong>. Si no apretás Actualizar,
            no aparecen los pedidos nuevos aunque ya hayan entrado.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <StepCard
            n={0}
            title="Abrir la página"
            body={<>Entrás a <span className="font-mono">Pedidos</span> desde el menú lateral. Lo primero que ves está cargado del caché del día anterior.</>}
          />
          <StepCard
            n={1}
            title="Apretar Actualizar"
            body={<>Botón <span className="font-mono">Actualizar</span> arriba a la derecha. Pide los pedidos nuevos a las 4 plataformas.</>}
          />
          <StepCard
            n={2}
            title="Mirar los contadores"
            body={<>Cada pestaña muestra entre paréntesis cuántos pedidos están <strong className="font-bold">pendientes</strong>. Si Ripley dice (3), tenés 3 pedidos por preparar en Ripley.</>}
          />
          <StepCard
            n={3}
            title="Descargar tickets"
            body={<>Entrás a cada pestaña con número y apretás <strong className="font-bold">Ticket de envío</strong> en cada pedido. Te descarga un PDF.</>}
          />
          <StepCard
            n={4}
            title="Marcar Shopify enviados"
            body={<>En la pestaña <span className="font-mono">Shopify</span>, después de despachar, apretás <strong className="font-bold">Marcar enviado</strong> en cada pedido.</>}
          />
          <StepCard
            n={5}
            title="Repetir cada hora"
            body={<>Volvés a apretar <strong className="font-bold">Actualizar</strong> a la hora siguiente. Repetís hasta las <strong className="font-bold">13:30</strong>.</>}
          />
        </div>
      </Section>

      {/* 02 — Anatomía de la página */}
      <Section index={1} title="Anatomía de la página" subtitle="Las partes que vas a ver siempre">
        <div className="mb-6">
          <LayoutDiagram />
        </div>

        <div className="space-y-3">
          <div className="border border-black p-4">
            <p className="text-[11px] font-bold tracking-[0.25em] uppercase mb-1">Botón Actualizar</p>
            <p className="text-xs font-light tracking-wider leading-relaxed text-neutral-700">
              Arriba a la derecha. Pide los pedidos nuevos. Mientras carga vas a ver un círculo girando.
              Si trae pedidos nuevos, sale un <strong className="font-bold">aviso negro</strong> arriba a
              la derecha tipo <em>&quot;3 pedidos nuevos&quot;</em> que dura 5 segundos.
            </p>
          </div>

          <div className="border border-black p-4">
            <p className="text-[11px] font-bold tracking-[0.25em] uppercase mb-1">Pestañas</p>
            <p className="text-xs font-light tracking-wider leading-relaxed text-neutral-700">
              Las 4 plataformas: <span className="font-mono">Ripley · Falabella · Shopify · Paris</span>.
              El número entre paréntesis es la cantidad de pedidos <strong className="font-bold">pendientes
              de envío</strong> en cada una. Cuando es <span className="font-mono">(0)</span> no tenés nada que
              hacer en esa pestaña.
            </p>
          </div>

          <div className="border border-black p-4">
            <p className="text-[11px] font-bold tracking-[0.25em] uppercase mb-1">Tarjetas de pedido</p>
            <p className="text-xs font-light tracking-wider leading-relaxed text-neutral-700">
              Cada pedido es una caja con borde negro. Arriba va el <strong className="font-bold">N° de orden</strong>,
              la fecha y el botón <strong className="font-bold">Ticket de envío</strong>. Abajo van los productos
              con foto, SKU y cantidad.
            </p>
          </div>
        </div>
      </Section>

      {/* 03 — Falabella */}
      <Section index={2} title="Pestaña Falabella" subtitle="El contador es la cantidad de pedidos en estado pending">
        <div className="space-y-3 mb-6">
          <div className="border border-black p-4">
            <p className="text-[11px] font-bold tracking-[0.25em] uppercase mb-1">Qué muestra</p>
            <p className="text-xs font-light tracking-wider leading-relaxed text-neutral-700">
              Una tarjeta por pedido, con un chip que dice el estado en español
              (<em>Pendiente, Listo para envío, Enviado, etc.</em>) y los productos adentro.
            </p>
          </div>
          <div className="border border-black p-4">
            <p className="text-[11px] font-bold tracking-[0.25em] uppercase mb-1">Cómo descargar el ticket</p>
            <p className="text-xs font-light tracking-wider leading-relaxed text-neutral-700">
              Botón <strong className="font-bold">Ticket de envío</strong> arriba a la derecha del pedido.
              Te baja un PDF directo desde Falabella. Si da error, esperá unos segundos y volvé a intentar:
              a veces el pedido todavía no terminó de generar la etiqueta.
            </p>
          </div>
        </div>

        <p className="text-[11px] font-bold tracking-[0.25em] uppercase mb-3">Glosario de estados</p>
        <Glossary rows={FALABELLA_GLOSARIO} />
      </Section>

      {/* 04 — Ripley */}
      <Section index={3} title="Pestaña Ripley" subtitle="El contador es la cantidad de pedidos en estado SHIPPING">
        <div className="space-y-3 mb-6">
          <div className="border border-black p-4">
            <p className="text-[11px] font-bold tracking-[0.25em] uppercase mb-1">Qué muestra</p>
            <p className="text-xs font-light tracking-wider leading-relaxed text-neutral-700">
              Una tarjeta por pedido, con el estado en español arriba y los productos abajo. La gran
              mayoría de los pedidos que vas a tocar van a estar en <span className="font-mono">SHIPPING</span>
              (En preparación).
            </p>
          </div>
          <div className="border border-black p-4">
            <p className="text-[11px] font-bold tracking-[0.25em] uppercase mb-1">Cómo descargar el ticket</p>
            <p className="text-xs font-light tracking-wider leading-relaxed text-neutral-700">
              Botón <strong className="font-bold">Ticket de envío</strong> arriba a la derecha del pedido.
              Ripley a veces tarda más en generar la etiqueta — si da error, esperá un par de minutos.
            </p>
          </div>
        </div>

        <p className="text-[11px] font-bold tracking-[0.25em] uppercase mb-3">Glosario de estados</p>
        <Glossary rows={RIPLEY_GLOSARIO} />
      </Section>

      {/* 05 — Shopify */}
      <Section index={4} title="Pestaña Shopify" subtitle="Funciona distinto a las otras tres — leer con atención">
        <div className="space-y-3 mb-6">
          <div className="border border-black p-4 bg-neutral-50">
            <p className="text-[11px] font-bold tracking-[0.25em] uppercase mb-1">La diferencia</p>
            <p className="text-xs font-light tracking-wider leading-relaxed text-neutral-700">
              Shopify <strong className="font-bold">no genera ticket automático</strong> como Falabella, Ripley
              o Paris. El <strong className="font-bold">admin</strong> tiene que subir el PDF del ticket. Vos solo
              lo descargás. Si el admin todavía no lo subió, vas a ver el cartel
              <em> &quot;Sin etiqueta disponible&quot;</em> en gris.
            </p>
          </div>

          <div className="border border-black p-4">
            <p className="text-[11px] font-bold tracking-[0.25em] uppercase mb-1">Cómo descargar el ticket</p>
            <p className="text-xs font-light tracking-wider leading-relaxed text-neutral-700">
              Si el admin ya subió el PDF, vas a ver el botón <strong className="font-bold">Descargar ticket</strong>.
              Lo apretás y se baja. Si dice <em>&quot;Sin etiqueta disponible&quot;</em>, no hay nada que hacer
              hasta que el admin lo cargue — avisale.
            </p>
          </div>

          <div className="border border-black p-4">
            <p className="text-[11px] font-bold tracking-[0.25em] uppercase mb-1">Marcar como enviado</p>
            <p className="text-xs font-light tracking-wider leading-relaxed text-neutral-700">
              Cuando ya despachaste el paquete, apretá <strong className="font-bold">Marcar enviado</strong> en
              ese pedido. Aparece un chip negro <span className="font-mono">ENVIADO</span> con tu nombre y la fecha.
              Si te equivocaste, hay un botón <strong className="font-bold">Deshacer</strong> al lado del chip.
            </p>
            <p className="text-xs font-light tracking-wider leading-relaxed text-neutral-700 mt-2">
              <strong className="font-bold">Importante:</strong> esa marca queda solo en nuestra app, no se manda a Shopify.
              Sirve para que vos y el admin sepan qué quedó listo y qué no.
            </p>
          </div>

          <div className="border border-black p-4">
            <p className="text-[11px] font-bold tracking-[0.25em] uppercase mb-1">Contador de la pestaña</p>
            <p className="text-xs font-light tracking-wider leading-relaxed text-neutral-700">
              <span className="font-mono">Shopify (N)</span> es la cantidad de pedidos que <strong className="font-bold">todavía
              no marcaste como enviados</strong>. Cuando los marcás todos, el contador queda en (0).
            </p>
          </div>
        </div>
      </Section>

      {/* 06 — Paris */}
      <Section index={5} title="Pestaña Paris" subtitle="Cada pedido tiene una o varias sub-órdenes">
        <div className="space-y-3 mb-6">
          <div className="border border-black p-4">
            <p className="text-[11px] font-bold tracking-[0.25em] uppercase mb-1">Qué muestra</p>
            <p className="text-xs font-light tracking-wider leading-relaxed text-neutral-700">
              Una tarjeta por pedido. Cada pedido tiene una o más <strong className="font-bold">sub-órdenes</strong>:
              son grupos de productos que viajan juntos en una transportista. Cada sub-orden tiene su
              propio ticket.
            </p>
          </div>
          <div className="border border-black p-4">
            <p className="text-[11px] font-bold tracking-[0.25em] uppercase mb-1">Cómo descargar el ticket</p>
            <p className="text-xs font-light tracking-wider leading-relaxed text-neutral-700">
              Cada sub-orden tiene su propio botón <strong className="font-bold">Ticket de envío</strong>. Si un
              pedido tiene 2 sub-órdenes, descargás 2 PDFs. Cada uno trae su transportista y N° de tracking.
            </p>
          </div>
          <div className="border border-black p-4">
            <p className="text-[11px] font-bold tracking-[0.25em] uppercase mb-1">Contador de la pestaña</p>
            <p className="text-xs font-light tracking-wider leading-relaxed text-neutral-700">
              <span className="font-mono">Paris (N)</span> cuenta los pedidos que tienen <strong className="font-bold">al
              menos un item abierto</strong> (pendiente / preparando / listo). En cuanto Paris marca todos los
              items como enviados o entregados, el pedido sale del contador.
            </p>
          </div>
        </div>

        <p className="text-[11px] font-bold tracking-[0.25em] uppercase mb-3">Glosario de estados</p>
        <Glossary rows={PARIS_GLOSARIO} />
      </Section>

      {/* Footer */}
      <div className="mt-16 pt-6 border-t border-black flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <p className="text-[10px] font-light tracking-[0.25em] uppercase text-neutral-500">
          Cualquier duda — preguntale al admin
        </p>
        <Link
          href="/orders"
          className="text-xs font-bold tracking-[0.25em] underline underline-offset-[6px] hover:no-underline"
        >
          Ir a Pedidos →
        </Link>
      </div>
    </div>
  );
}
