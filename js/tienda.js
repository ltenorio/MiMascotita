const CLAVE_CARRITO = "mimascotita-carrito";
const CLAVE_SUS = "mimascotita-suscripcion";
const CLAVE_CIERRE = "mimascotita-popup-cerrado";
const CLAVE_PEDIDO = "mimascotita-ultimo-pedido";
const CODIGO_BONO = "INVIERNO15";
const ENVIO_BARRIO = 8000;
const DESTACADOS = ["abrigo-lana", "granja-norte", "iglu-lana", "caldo-invierno"];

const COP = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

let estadoFicha = { id: "", talla: "", qty: 1 };
let desdeFormulario = false;
let volcando = false;
let rutaVista = "";
let temporizadorPopup = 0;
let ultimoFocoCajon = null;

function esc(valor) {
  return String(valor)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buscarProducto(id) {
  return PRODUCTOS.find((producto) => producto.id === id) || null;
}

function leerCarrito() {
  try {
    const datos = JSON.parse(localStorage.getItem(CLAVE_CARRITO) || "");
    if (!datos || !Array.isArray(datos.items)) return { items: [], bono: false };
    const items = datos.items
      .filter((item) => item && buscarProducto(item.id))
      .map((item) => ({
        id: item.id,
        talla: item.talla || "",
        qty: Math.min(8, Math.max(1, Math.round(Number(item.qty) || 1))),
      }));
    return { items, bono: Boolean(datos.bono) };
  } catch (error) {
    return { items: [], bono: false };
  }
}

function guardarCarrito(carrito) {
  localStorage.setItem(CLAVE_CARRITO, JSON.stringify(carrito));
}

function leerSuscripcion() {
  try {
    const datos = JSON.parse(localStorage.getItem(CLAVE_SUS) || "");
    if (!datos || !datos.correo) return null;
    return datos;
  } catch (error) {
    return null;
  }
}

function leerUltimoPedido() {
  try {
    const datos = JSON.parse(sessionStorage.getItem(CLAVE_PEDIDO) || "");
    if (!datos || !datos.numero) return null;
    return datos;
  } catch (error) {
    return null;
  }
}

function bonoActivo() {
  return leerCarrito().bono;
}

function precioUnitario(producto) {
  if (producto.temporada && bonoActivo()) return Math.round(producto.precio * 0.85);
  return producto.precio;
}

function totales(envio) {
  const items = leerCarrito()
    .items.map((linea) => {
      const producto = buscarProducto(linea.id);
      if (!producto) return null;
      return { linea, producto, unitario: precioUnitario(producto) };
    })
    .filter(Boolean);
  const subtotal = items.reduce((suma, item) => suma + item.producto.precio * item.linea.qty, 0);
  const neto = items.reduce((suma, item) => suma + item.unitario * item.linea.qty, 0);
  return {
    items,
    subtotal,
    descuento: subtotal - neto,
    envio,
    total: neto + envio,
  };
}

function entregaActual() {
  const marcado = document.querySelector('#form-pedido input[name="entrega"]:checked');
  return marcado ? marcado.value : "retiro";
}

function costoEnvio() {
  return entregaActual() === "envio" ? ENVIO_BARRIO : 0;
}

function anunciar(texto) {
  const aviso = document.getElementById("aviso-vivo");
  aviso.textContent = "";
  aviso.textContent = texto;
}

function vigilarImagenes(raiz) {
  raiz.querySelectorAll("img").forEach((img) => {
    if (img.dataset.vigilada) return;
    img.dataset.vigilada = "1";
    const reservar = () => {
      const reserva = document.createElement("div");
      reserva.className = "foto-reserva";
      reserva.textContent = img.getAttribute("data-nombre") || img.alt || "MiMascotita";
      img.replaceWith(reserva);
    };
    img.addEventListener("error", reservar);
    if (img.complete && img.naturalWidth === 0) reservar();
  });
}

function poner(elemento, html) {
  elemento.innerHTML = html;
  vigilarImagenes(elemento);
}

function htmlPrecio(producto) {
  if (bonoActivo() && producto.temporada) {
    return `<span class="precio-antes">${COP.format(producto.precio)}</span><span class="precio-ahora">${COP.format(precioUnitario(producto))}</span>`;
  }
  return `<span class="precio-ahora">${COP.format(producto.precio)}</span>`;
}

function htmlTarjeta(producto) {
  const accion = producto.tallas
    ? `<a class="boton" href="#/producto/${esc(producto.id)}">Elegir talla</a>`
    : `<button class="boton" type="button" data-accion="agregar" data-id="${esc(producto.id)}">Agregar</button>`;
  return `<article class="tarjeta">
    <a class="marco" href="#/producto/${esc(producto.id)}" tabindex="-1" aria-hidden="true">
      <img src="${esc(producto.imagen)}" alt="" data-nombre="${esc(producto.nombre)}">
    </a>
    <div class="tarjeta-cuerpo">
      <p class="kicker">${esc(CATEGORIA[producto.categoria])} · ${esc(MASCOTA[producto.mascota])}</p>
      <h3><a href="#/producto/${esc(producto.id)}">${esc(producto.nombre)}</a></h3>
      <p class="resumen">${esc(producto.resumen)}</p>
      <div class="tarjeta-pie">
        <p class="precios">${htmlPrecio(producto)}</p>
        ${accion}
      </div>
    </div>
  </article>`;
}

function htmlLinea(item) {
  const { linea, producto, unitario } = item;
  const talla = linea.talla ? ` · Talla ${esc(linea.talla)}` : "";
  const cadaUna = linea.qty > 1 ? `<p class="nota">${COP.format(unitario)} cada una</p>` : "";
  return `<article class="linea">
    <img src="${esc(producto.imagen)}" alt="" data-nombre="${esc(producto.nombre)}">
    <div>
      <h3><a href="#/producto/${esc(producto.id)}">${esc(producto.nombre)}</a></h3>
      <p class="nota">${esc(CATEGORIA[producto.categoria])}${talla}</p>
      ${cadaUna}
      <div class="cantidad">
        <button type="button" data-accion="menos" data-id="${esc(producto.id)}" data-talla="${esc(linea.talla)}" aria-label="Quitar una unidad de ${esc(producto.nombre)}">−</button>
        <span>${linea.qty}</span>
        <button type="button" data-accion="mas" data-id="${esc(producto.id)}" data-talla="${esc(linea.talla)}" aria-label="Sumar una unidad de ${esc(producto.nombre)}">+</button>
        <button class="boton texto" type="button" data-accion="quitar" data-id="${esc(producto.id)}" data-talla="${esc(linea.talla)}">Quitar</button>
      </div>
    </div>
    <p class="precio-ahora">${COP.format(unitario * linea.qty)}</p>
  </article>`;
}

function leerRuta() {
  const bruto = (location.hash || "#/").slice(1);
  const partes = bruto.split("?");
  const camino = partes[0];
  const consulta = partes[1] || "";
  const segmentos = camino.split("/").filter(Boolean);
  const nombre = segmentos[0] || "inicio";
  const params = new URLSearchParams(consulta);
  if (!["inicio", "catalogo", "producto", "carrito"].includes(nombre)) {
    return { nombre: "inicio", id: "", params };
  }
  return { nombre, id: segmentos[1] || "", params };
}

function hashCatalogo() {
  const form = document.getElementById("filtros");
  const params = new URLSearchParams();
  const texto = form.buscar.value.trim();
  if (texto) params.set("buscar", texto);
  if (form.mascota.value !== "todos") params.set("mascota", form.mascota.value);
  if (form.categoria.value !== "todos") params.set("categoria", form.categoria.value);
  const consulta = params.toString();
  return consulta ? `#/catalogo?${consulta}` : "#/catalogo";
}

function volcarFiltros(ruta) {
  const form = document.getElementById("filtros");
  volcando = true;
  form.buscar.value = ruta.params.get("buscar") || "";
  const mascota = ruta.params.get("mascota") || "todos";
  const categoria = ruta.params.get("categoria") || "todos";
  form.mascota.value = [...form.mascota.options].some((opcion) => opcion.value === mascota) ? mascota : "todos";
  form.categoria.value = [...form.categoria.options].some((opcion) => opcion.value === categoria) ? categoria : "todos";
  volcando = false;
}

function productosFiltrados() {
  const form = document.getElementById("filtros");
  const texto = form.buscar.value.trim().toLowerCase();
  const mascota = form.mascota.value;
  const categoria = form.categoria.value;
  return PRODUCTOS.filter((producto) => {
    const contenido = `${producto.nombre} ${producto.resumen} ${producto.descripcion}`.toLowerCase();
    const coincideTexto = !texto || contenido.includes(texto);
    const coincideMascota = mascota === "todos" || producto.mascota === mascota || producto.mascota === "todos";
    const coincideTipo = categoria === "todos" || producto.categoria === categoria;
    return coincideTexto && coincideMascota && coincideTipo;
  });
}

function pintarGrid() {
  const lista = productosFiltrados();
  const conteo = document.getElementById("conteo-catalogo");
  const grid = document.getElementById("grid-catalogo");
  const palabra = lista.length === 1 ? "pieza" : "piezas";
  conteo.textContent = `${lista.length} ${palabra}`;
  if (!lista.length) {
    poner(grid, `<div class="vacio"><h2>Nada coincide.</h2><p>Prueba con otra mascota o borra la búsqueda.</p></div>`);
    return;
  }
  poner(grid, lista.map(htmlTarjeta).join(""));
}

function relacionados(producto) {
  const ids = [];
  if (producto.complemento) ids.push(producto.complemento);
  PRODUCTOS.forEach((otro) => {
    if (otro.categoria === producto.categoria) ids.push(otro.id);
  });
  PRODUCTOS.forEach((otro) => ids.push(otro.id));
  return [...new Set(ids)]
    .filter((id) => id !== producto.id)
    .slice(0, 3)
    .map(buscarProducto)
    .filter(Boolean);
}

function pintarProducto(id) {
  const ficha = document.getElementById("ficha");
  const producto = buscarProducto(id);
  if (!producto) {
    document.title = "Pieza no encontrada · MiMascotita";
    poner(ficha, `<header class="encabezado-pagina"><h1>Esa pieza no está.</h1><p><a class="boton" href="#/catalogo">Volver a la colección</a></p></header>`);
    return;
  }
  document.title = `${producto.nombre} · MiMascotita`;
  const tallas = producto.tallas
    ? `<div class="tallas" role="radiogroup" aria-label="Talla">
        ${producto.tallas.map((talla) => `<button class="talla" type="button" data-accion="talla" data-talla="${esc(talla)}" aria-pressed="${estadoFicha.talla === talla ? "true" : "false"}">${esc(talla)}</button>`).join("")}
      </div>
      <p class="nota">${esc(producto.tallaGuia)}</p>
      <p id="error-talla" class="error" hidden></p>`
    : "";
  const otros = relacionados(producto).map(htmlTarjeta).join("");
  poner(ficha, `<article class="ficha">
      <figure class="marco">
        <img src="${esc(producto.imagen)}" alt="${esc(producto.nombre)}" data-nombre="${esc(producto.nombre)}">
      </figure>
      <div>
        <p class="miga"><a href="#/">Inicio</a> · <a href="#/catalogo">Colección</a> · ${esc(producto.nombre)}</p>
        <p class="kicker">${esc(CATEGORIA[producto.categoria])} · ${esc(MASCOTA[producto.mascota])}</p>
        <h1>${esc(producto.nombre)}</h1>
        <p>${esc(producto.descripcion)}</p>
        <p class="precios">${htmlPrecio(producto)}</p>
        <p class="nota">${esc(producto.presentacion)}</p>
        ${tallas}
        <div class="opciones">
          <div class="cantidad" aria-label="Cantidad">
            <button type="button" data-accion="cantidad-local" data-delta="-1" aria-label="Menos">−</button>
            <span id="cantidad-ficha">${estadoFicha.qty}</span>
            <button type="button" data-accion="cantidad-local" data-delta="1" aria-label="Más">+</button>
          </div>
          <button class="boton" type="button" data-accion="agregar" data-id="${esc(producto.id)}">Agregar al pedido</button>
        </div>
        <div class="nota-cuidado"><p class="nota">${esc(NOTAS[producto.categoria])}</p></div>
        <ul class="incluye">
          ${producto.incluye.map((item) => `<li>${esc(item)}</li>`).join("")}
        </ul>
      </div>
    </article>
    <div class="relacionados">
      <h2>También abriga.</h2>
      <div class="rejilla">${otros}</div>
    </div>`);
}

function pintarDestacados() {
  const piezas = DESTACADOS.map(buscarProducto).filter(Boolean);
  poner(document.getElementById("grid-destacados"), piezas.map(htmlTarjeta).join(""));
}

function htmlComplemento(carrito) {
  const primero = carrito.items[0];
  if (!primero) return "";
  const producto = buscarProducto(primero.id);
  if (!producto || !producto.complemento) return "";
  if (carrito.items.some((item) => item.id === producto.complemento)) return "";
  const extra = buscarProducto(producto.complemento);
  if (!extra) return "";
  const accion = extra.tallas
    ? `<a class="boton secundario" href="#/producto/${esc(extra.id)}">Elegir talla</a>`
    : `<button class="boton secundario" type="button" data-accion="agregar" data-id="${esc(extra.id)}">Agregar</button>`;
  return `<div class="complemento"><p>Combina con <strong>${esc(extra.nombre)}</strong></p>${accion}</div>`;
}

function pintarCajon() {
  const cuerpo = document.getElementById("cajon-cuerpo");
  const carrito = leerCarrito();
  if (!carrito.items.length) {
    poner(cuerpo, `<p>Todavía no hay piezas.</p><a class="boton" href="#/catalogo">Ver la colección</a>`);
    return;
  }
  const cuenta = totales(0);
  const descuento = cuenta.descuento
    ? `<div class="fila"><span>Precio de lista</span><span>${COP.format(cuenta.subtotal)}</span></div>
       <div class="fila"><span>Bono de invierno</span><span>−${COP.format(cuenta.descuento)}</span></div>`
    : `<p class="nota">Si aún no tienes el bono, pídelo y el 15% entra aquí.</p>`;
  poner(cuerpo, `
    ${cuenta.items.map(htmlLinea).join("")}
    ${htmlComplemento(carrito)}
    <div class="cajon-total">
      ${descuento}
      <div class="fila total"><span>Total de piezas</span><span>${COP.format(cuenta.total)}</span></div>
      <p class="nota">El envío se ve al reservar.</p>
      <a class="boton completo" href="#/carrito">Revisar y reservar</a>
    </div>`);
}

function pintarEstadoBono() {
  const caja = document.getElementById("estado-bono");
  const campos = document.getElementById("campos-bono");
  if (bonoActivo()) {
    poner(caja, `<div class="chip"><span>${CODIGO_BONO} · 15%</span><button class="boton texto" type="button" data-accion="quitar-bono">Quitar</button></div>`);
    campos.hidden = true;
    return;
  }
  caja.innerHTML = "";
  campos.hidden = false;
}

function pintarCifras() {
  const cuenta = totales(costoEnvio());
  document.getElementById("cifras").innerHTML = `
    <div class="fila"><span>Precio de lista</span><span>${COP.format(cuenta.subtotal)}</span></div>
    <div class="fila"><span>Bono de invierno</span><span>${cuenta.descuento ? `−${COP.format(cuenta.descuento)}` : COP.format(0)}</span></div>
    <div class="fila"><span>Entrega</span><span>${cuenta.envio ? COP.format(cuenta.envio) : "Retiro sin costo"}</span></div>
    <div class="fila total"><span>Total</span><span>${COP.format(cuenta.total)}</span></div>`;
}

function pintarCarrito() {
  const lineas = document.getElementById("lineas-pedido");
  const vacio = document.getElementById("vacio-pedido");
  const form = document.getElementById("form-pedido");
  const listo = document.getElementById("pedido-listo");
  const pedido = leerUltimoPedido();
  const carrito = leerCarrito();
  document.title = "Tu pedido · MiMascotita";
  if (!carrito.items.length && pedido) {
    vacio.hidden = true;
    form.hidden = true;
    listo.hidden = false;
    document.getElementById("numero-pedido").textContent = pedido.numero;
    document.getElementById("detalle-pedido").textContent = `${pedido.nombre}, el total reservado es ${COP.format(pedido.total)}.`;
    return;
  }
  listo.hidden = true;
  if (!carrito.items.length) {
    vacio.hidden = false;
    form.hidden = true;
    lineas.innerHTML = "";
    return;
  }
  vacio.hidden = true;
  form.hidden = false;
  listo.hidden = true;
  poner(lineas, totales(0).items.map(htmlLinea).join(""));
  pintarEstadoBono();
  pintarCifras();
}

function pintarCromo(ruta) {
  const carrito = leerCarrito();
  const cuenta = carrito.items.reduce((suma, item) => suma + item.qty, 0);
  document.getElementById("cuenta-pedido").textContent = String(cuenta);
  const palabra = cuenta === 1 ? "pieza" : "piezas";
  document.getElementById("bolsa").setAttribute("aria-label", `Abrir pedido, ${cuenta} ${palabra}`);
  const cinta = document.getElementById("cinta");
  const suscripcion = leerSuscripcion();
  if (suscripcion) cinta.textContent = "Tu bono de invierno está listo · 15% en la colección";
  else if (carrito.bono) cinta.textContent = "Bono aplicado · 15% en alimento, ropa y accesorios";
  else cinta.textContent = "Temporada de invierno · pide el bono del 15%";
  document.querySelectorAll("[data-nav]").forEach((enlace) => {
    const mapa = {
      inicio: ruta.nombre === "inicio",
      coleccion: ruta.nombre === "catalogo" || ruta.nombre === "producto",
      pedido: ruta.nombre === "carrito",
    };
    if (mapa[enlace.dataset.nav]) enlace.setAttribute("aria-current", "page");
    else enlace.removeAttribute("aria-current");
  });
  if (suscripcion) {
    const mensaje = document.getElementById("mensaje-pie");
    mensaje.hidden = false;
    mensaje.textContent = `Bono guardado para ${suscripcion.correo}. Tu código es ${CODIGO_BONO}.`;
  }
}

function activarVista(nombre) {
  document.querySelectorAll(".vista").forEach((vista) => {
    const activa = vista.id === `vista-${nombre}`;
    vista.classList.toggle("activa", activa);
    if (activa) vista.removeAttribute("aria-hidden");
    else vista.setAttribute("aria-hidden", "true");
  });
}

function pintarVista(ruta) {
  if (ruta.nombre === "inicio") {
    document.title = "MiMascotita · tienda de barrio";
    pintarDestacados();
    return;
  }
  if (ruta.nombre === "catalogo") {
    document.title = "Colección de invierno · MiMascotita";
    pintarGrid();
    return;
  }
  if (ruta.nombre === "producto") {
    if (estadoFicha.id !== ruta.id) estadoFicha = { id: ruta.id, talla: "", qty: 1 };
    pintarProducto(ruta.id);
    return;
  }
  pintarCarrito();
}

function syncScroll() {
  const popup = document.getElementById("popup");
  const cajon = document.getElementById("cajon-fondo");
  const bloqueado = !popup.hidden || !cajon.hidden || document.body.classList.contains("menu-abierto");
  document.body.classList.toggle("sin-scroll", bloqueado);
  const fondoBloqueado = !popup.hidden || !cajon.hidden;
  document.getElementById("contenido").inert = fondoBloqueado;
  document.querySelector(".fijo").inert = fondoBloqueado;
  document.querySelector(".sitio-pie").inert = fondoBloqueado;
}

function cerrarMenu() {
  document.body.classList.remove("menu-abierto");
  const boton = document.getElementById("menu-boton");
  boton.setAttribute("aria-expanded", "false");
  boton.textContent = "Menú";
  syncScroll();
}

function abrirCajon() {
  const fondo = document.getElementById("cajon-fondo");
  if (fondo.hidden) ultimoFocoCajon = document.activeElement;
  fondo.hidden = false;
  pintarCajon();
  syncScroll();
  document.querySelector("#cajon .cajon-cabecera button").focus();
}

function cerrarCajon(restaurar) {
  const fondo = document.getElementById("cajon-fondo");
  if (fondo.hidden) return;
  fondo.hidden = true;
  syncScroll();
  if (restaurar !== false && ultimoFocoCajon && ultimoFocoCajon.focus) ultimoFocoCajon.focus();
}

function abrirPopup() {
  window.clearTimeout(temporizadorPopup);
  cerrarCajon(false);
  const suscripcion = leerSuscripcion();
  document.getElementById("popup-oferta").hidden = Boolean(suscripcion);
  document.getElementById("popup-listo").hidden = !suscripcion;
  document.getElementById("popup").hidden = false;
  const foco = suscripcion
    ? document.querySelector("#popup-listo a")
    : document.querySelector('#form-popup input[name="correo"]');
  foco.focus();
  syncScroll();
}

function cerrarPopup() {
  const popup = document.getElementById("popup");
  if (popup.hidden) return;
  popup.hidden = true;
  sessionStorage.setItem(CLAVE_CIERRE, "1");
  syncScroll();
  document.getElementById("cinta").focus();
}

function programarPopup() {
  temporizadorPopup = window.setTimeout(() => {
    if (leerRuta().nombre !== "inicio") return;
    if (leerSuscripcion()) return;
    if (sessionStorage.getItem(CLAVE_CIERRE)) return;
    if (!document.getElementById("popup").hidden) return;
    abrirPopup();
  }, 700);
}

function fallo(elemento, texto) {
  elemento.hidden = false;
  elemento.textContent = texto;
}

function correoValido(valor) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor);
}

function procesarSuscripcion(correo, acepto, error) {
  if (!acepto) {
    fallo(error, "Necesitamos tu aceptación para guardar el bono.");
    return false;
  }
  const limpio = correo.trim().toLowerCase();
  if (!correoValido(limpio)) {
    fallo(error, "Revisa el correo e inténtalo de nuevo.");
    return false;
  }
  localStorage.setItem(CLAVE_SUS, JSON.stringify({ correo: limpio }));
  const carrito = leerCarrito();
  carrito.bono = true;
  guardarCarrito(carrito);
  error.hidden = true;
  anunciar("Bono de invierno guardado.");
  pintarCromo(leerRuta());
  pintarCajon();
  pintarVista(leerRuta());
  return true;
}

function marcarAgregado(boton) {
  if (!boton) return;
  const previo = boton.textContent;
  boton.textContent = "Agregado";
  window.setTimeout(() => {
    boton.textContent = previo;
  }, 900);
}

function agregarProducto(id, talla, qty, boton) {
  const producto = buscarProducto(id);
  if (!producto) return;
  if (producto.tallas && !talla) {
    const error = document.getElementById("error-talla");
    if (error) {
      error.hidden = false;
      error.textContent = "Elige una talla antes de agregar.";
    }
    anunciar("Elige una talla antes de agregar.");
    return;
  }
  const carrito = leerCarrito();
  const linea = carrito.items.find((item) => item.id === id && item.talla === (talla || ""));
  const actual = linea ? linea.qty : 0;
  if (actual + qty > 8) anunciar("Máximo 8 unidades por pieza.");
  else anunciar(`${producto.nombre} se agregó al pedido.`);
  const nueva = Math.min(8, actual + qty);
  if (linea) linea.qty = nueva;
  else carrito.items.push({ id, talla: talla || "", qty: nueva });
  guardarCarrito(carrito);
  if (boton && actual + qty <= 8) marcarAgregado(boton);
  pintarCromo(leerRuta());
  pintarCajon();
  if (leerRuta().nombre === "carrito") pintarCarrito();
  else abrirCajon();
}

function cambiarQty(id, talla, delta) {
  const carrito = leerCarrito();
  const linea = carrito.items.find((item) => item.id === id && item.talla === talla);
  if (!linea) return;
  if (linea.qty + delta > 8) {
    anunciar("Máximo 8 unidades por pieza.");
    return;
  }
  linea.qty = Math.max(1, linea.qty + delta);
  guardarCarrito(carrito);
  pintarCromo(leerRuta());
  pintarCajon();
  if (leerRuta().nombre === "carrito") pintarCarrito();
}

function quitarLinea(id, talla) {
  const carrito = leerCarrito();
  carrito.items = carrito.items.filter((item) => !(item.id === id && item.talla === talla));
  guardarCarrito(carrito);
  anunciar("Pieza quitada del pedido.");
  pintarCromo(leerRuta());
  pintarCajon();
  if (leerRuta().nombre === "carrito") pintarCarrito();
}

function aplicarCodigo() {
  const input = document.getElementById("codigo-bono");
  const mensaje = document.getElementById("mensaje-bono");
  if (input.value.trim().toUpperCase() !== CODIGO_BONO) {
    mensaje.className = "error";
    mensaje.textContent = "Ese bono no corresponde a esta temporada.";
    return;
  }
  const carrito = leerCarrito();
  carrito.bono = true;
  guardarCarrito(carrito);
  mensaje.className = "ok";
  mensaje.textContent = "Bono aplicado a la colección de invierno.";
  anunciar("Bono aplicado.");
  pintarCromo(leerRuta());
  pintarCajon();
  pintarVista(leerRuta());
}

function quitarBono() {
  const carrito = leerCarrito();
  carrito.bono = false;
  guardarCarrito(carrito);
  anunciar("Bono quitado del pedido.");
  pintarCromo(leerRuta());
  pintarCajon();
  pintarVista(leerRuta());
}

function enRuta() {
  const ruta = leerRuta();
  const clave = `${ruta.nombre}/${ruta.id}`;
  if (clave !== rutaVista) {
    window.scrollTo(0, 0);
    cerrarCajon(false);
    rutaVista = clave;
  }
  if (ruta.nombre === "catalogo" && !desdeFormulario) volcarFiltros(ruta);
  desdeFormulario = false;
  activarVista(ruta.nombre);
  cerrarMenu();
  pintarVista(ruta);
  pintarCromo(ruta);
}

function alFiltrar() {
  if (volcando) return;
  const siguiente = hashCatalogo();
  if ((location.hash || "#/") === siguiente) {
    pintarGrid();
    return;
  }
  desdeFormulario = true;
  location.hash = siguiente;
}

function alClick(evento) {
  const elemento = evento.target.closest("[data-accion]");
  if (!elemento) return;
  if (elemento.matches("button")) evento.preventDefault();
  const accion = elemento.dataset.accion;
  if (accion === "menu") {
    const abierto = document.body.classList.toggle("menu-abierto");
    elemento.setAttribute("aria-expanded", String(abierto));
    elemento.textContent = abierto ? "Cerrar" : "Menú";
    syncScroll();
    return;
  }
  if (accion === "abrir-popup") abrirPopup();
  if (accion === "cerrar-popup") cerrarPopup();
  if (accion === "abrir-cajon") abrirCajon();
  if (accion === "cerrar-cajon") cerrarCajon();
  if (accion === "agregar") {
    const id = elemento.dataset.id;
    const enFicha = leerRuta().nombre === "producto" && leerRuta().id === id;
    agregarProducto(id, enFicha ? estadoFicha.talla : "", enFicha ? estadoFicha.qty : 1, elemento);
  }
  if (accion === "mas") cambiarQty(elemento.dataset.id, elemento.dataset.talla || "", 1);
  if (accion === "menos") cambiarQty(elemento.dataset.id, elemento.dataset.talla || "", -1);
  if (accion === "quitar") quitarLinea(elemento.dataset.id, elemento.dataset.talla || "");
  if (accion === "talla") {
    estadoFicha.talla = elemento.dataset.talla;
    document.querySelectorAll(".talla").forEach((boton) => {
      boton.setAttribute("aria-pressed", String(boton === elemento));
    });
    const error = document.getElementById("error-talla");
    if (error) error.hidden = true;
  }
  if (accion === "cantidad-local") {
    const delta = Number(elemento.dataset.delta);
    estadoFicha.qty = Math.min(8, Math.max(1, estadoFicha.qty + delta));
    const etiqueta = document.getElementById("cantidad-ficha");
    if (etiqueta) etiqueta.textContent = String(estadoFicha.qty);
  }
  if (accion === "aplicar-bono") aplicarCodigo();
  if (accion === "quitar-bono") quitarBono();
  if (accion === "otro-pedido") {
    sessionStorage.removeItem(CLAVE_PEDIDO);
    pintarCarrito();
  }
}

function focosDentro(contenedor) {
  return [...contenedor.querySelectorAll("a, button, input, select, textarea")].filter((elemento) => {
    if (elemento.disabled || elemento.hidden) return false;
    if (elemento.closest("[hidden]")) return false;
    return true;
  });
}

function atrapar(evento, contenedor) {
  const focos = focosDentro(contenedor);
  if (!focos.length) return;
  const primero = focos[0];
  const ultimo = focos[focos.length - 1];
  if (evento.shiftKey && document.activeElement === primero) {
    evento.preventDefault();
    ultimo.focus();
  } else if (!evento.shiftKey && document.activeElement === ultimo) {
    evento.preventDefault();
    primero.focus();
  }
}

function alTecla(evento) {
  if (evento.key === "Escape") {
    if (!document.getElementById("popup").hidden) cerrarPopup();
    else if (!document.getElementById("cajon-fondo").hidden) cerrarCajon();
    else cerrarMenu();
    return;
  }
  if (evento.key !== "Tab") return;
  if (!document.getElementById("popup").hidden) atrapar(evento, document.getElementById("popup-dialogo"));
  else if (!document.getElementById("cajon-fondo").hidden) atrapar(evento, document.getElementById("cajon"));
}

function alSuscribirPopup(evento) {
  evento.preventDefault();
  const form = evento.currentTarget;
  const bien = procesarSuscripcion(form.correo.value, form.acepto.checked, document.getElementById("error-popup"));
  if (!bien) return;
  document.getElementById("popup-oferta").hidden = true;
  document.getElementById("popup-listo").hidden = false;
  document.querySelector("#popup-listo a").focus();
}

function alSuscribirPie(evento) {
  evento.preventDefault();
  const form = evento.currentTarget;
  const error = document.getElementById("error-pie");
  const bien = procesarSuscripcion(form.correo.value, form.acepto.checked, error);
  if (!bien) return;
  form.reset();
}

function alReservar(evento) {
  evento.preventDefault();
  const form = evento.currentTarget;
  const error = document.getElementById("error-pedido");
  if (!leerCarrito().items.length) return;
  const nombre = form.nombre.value.trim();
  const telefono = form.telefono.value.trim();
  const direccion = form.direccion.value.trim();
  if (nombre.length < 3) {
    fallo(error, "Escríbenos tu nombre.");
    return;
  }
  if (telefono.replace(/\D/g, "").length < 7) {
    fallo(error, "Revisa el teléfono.");
    return;
  }
  if (entregaActual() === "envio" && direccion.length < 5) {
    fallo(error, "Escríbenos la dirección para el envío.");
    return;
  }
  error.hidden = true;
  const cuenta = totales(costoEnvio());
  const numero = `MM-${Date.now().toString().slice(-6)}`;
  sessionStorage.setItem(CLAVE_PEDIDO, JSON.stringify({ numero, total: cuenta.total, nombre }));
  const carrito = leerCarrito();
  carrito.items = [];
  guardarCarrito(carrito);
  form.reset();
  document.getElementById("campo-direccion").hidden = true;
  anunciar(`Pedido ${numero} reservado.`);
  pintarCromo(leerRuta());
  pintarCajon();
  pintarCarrito();
}

function enganchar() {
  document.addEventListener("click", alClick);
  document.addEventListener("keydown", alTecla);
  document.getElementById("filtros").addEventListener("input", alFiltrar);
  document.getElementById("filtros").addEventListener("submit", (evento) => evento.preventDefault());
  document.getElementById("form-popup").addEventListener("submit", alSuscribirPopup);
  document.getElementById("form-pie").addEventListener("submit", alSuscribirPie);
  document.getElementById("form-pedido").addEventListener("submit", alReservar);
  document.getElementById("form-pedido").addEventListener("change", () => {
    document.getElementById("campo-direccion").hidden = entregaActual() !== "envio";
    if (leerRuta().nombre === "carrito" && !document.getElementById("form-pedido").hidden) pintarCifras();
  });
  document.getElementById("cajon-fondo").addEventListener("click", (evento) => {
    if (evento.target.id === "cajon-fondo") cerrarCajon();
  });
  document.getElementById("popup").addEventListener("click", (evento) => {
    if (evento.target.id === "popup") cerrarPopup();
  });
  document.querySelectorAll("#menu-principal a").forEach((enlace) => {
    enlace.addEventListener("click", cerrarMenu);
  });
  window.addEventListener("hashchange", enRuta);
}

function arrancar() {
  vigilarImagenes(document);
  enganchar();
  if (!location.hash) location.hash = "#/";
  enRuta();
  programarPopup();
}

arrancar();
