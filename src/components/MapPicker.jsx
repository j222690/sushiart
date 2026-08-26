import { useCallback, useEffect, useRef, useState } from 'react';
import { Crosshair, Loader2, MapPin } from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

/**
 * Mapa para o cliente marcar onde quer receber.
 *
 * Leaflet puro, sem o wrapper de React: é um componente só, e o wrapper
 * amarraria o projeto à versão do React (o react-leaflet 5 exige React 19).
 *
 * Tiles do OpenStreetMap — sem chave de API e sem conta de cobrança. Google
 * Maps exigiria faturamento no nome do dono do restaurante, e o mapa aqui não
 * faz nada que justifique essa dependência.
 *
 * O que este componente devolve: `{ lat, lng, neighborhood, street, number }`.
 * O bairro é uma SUGESTÃO — quem confirma é a pessoa, no formulário. Ver
 * `AddressForm`: geocodificação erra nome de bairro com frequência, e deixar
 * ela decidir sozinha resultaria em pedido recusado por causa de grafia.
 */

// Ícone padrão do Leaflet quebra com bundler (ele monta o caminho da imagem em
// tempo de execução). Um pino em SVG inline resolve e ainda segue a marca.
const PINO = L.divIcon({
  className: '',
  html: `<svg width="32" height="42" viewBox="0 0 32 42" xmlns="http://www.w3.org/2000/svg">
    <path d="M16 0C7.2 0 0 7.2 0 16c0 11 16 26 16 26s16-15 16-26C32 7.2 24.8 0 16 0z" fill="#8B2635"/>
    <circle cx="16" cy="16" r="6" fill="#F5F1EA"/>
  </svg>`,
  iconSize: [32, 42],
  iconAnchor: [16, 42],
});

/**
 * Descobre o endereço de um ponto (geocodificação reversa) pelo Nominatim.
 *
 * O Nominatim é gratuito e pede uso comedido — por isso só é chamado quando a
 * pessoa solta o pino, nunca enquanto arrasta. Se falhar, o fluxo continua: o
 * ponto no mapa já é o que o entregador precisa, e o bairro a pessoa escolhe
 * na lista de qualquer forma.
 */
async function descobrirEndereco(lat, lng) {
  const url =
    `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&addressdetails=1` +
    `&lat=${lat}&lon=${lng}&accept-language=pt-BR`;

  try {
    const resposta = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!resposta.ok) return null;

    const dados = await resposta.json();
    const e = dados.address ?? {};

    return {
      // O Nominatim chama bairro de vários nomes conforme a região.
      neighborhood: e.suburb || e.neighbourhood || e.city_district || e.quarter || '',
      street: e.road || '',
      number: e.house_number || '',
      city: e.city || e.town || e.village || '',
      zip: (e.postcode || '').replace(/\D/g, ''),
    };
  } catch {
    return null;
  }
}

export default function MapPicker({ lat, lng, centro, zoom = 15, onChange, className }) {
  const container = useRef(null);
  const mapa = useRef(null);
  const marcador = useRef(null);
  const [buscando, setBuscando] = useState(false);
  const [erroGps, setErroGps] = useState(null);

  // Guardado em ref para o mapa não ser recriado quando o pai re-renderiza.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const mover = useCallback(async (novaLat, novaLng) => {
    marcador.current?.setLatLng([novaLat, novaLng]);
    setBuscando(true);

    const endereco = await descobrirEndereco(novaLat, novaLng);
    setBuscando(false);

    onChangeRef.current?.({ lat: novaLat, lng: novaLng, ...(endereco ?? {}) });
  }, []);

  useEffect(() => {
    if (mapa.current || !container.current) return;

    const inicial = [lat ?? centro?.lat ?? -27.1009, lng ?? centro?.lng ?? -52.6156];

    const instancia = L.map(container.current, {
      center: inicial,
      zoom: lat ? 17 : zoom,
      // Rolar a página com o dedo não pode virar zoom no mapa sem querer.
      scrollWheelZoom: false,
      attributionControl: true,
    });

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap',
    }).addTo(instancia);

    marcador.current = L.marker(inicial, { icon: PINO, draggable: true }).addTo(instancia);
    marcador.current.on('dragend', (evento) => {
      const { lat: a, lng: b } = evento.target.getLatLng();
      mover(a, b);
    });

    // Tocar no mapa também move o pino: mais fácil que arrastar no celular.
    instancia.on('click', (evento) => mover(evento.latlng.lat, evento.latlng.lng));

    mapa.current = instancia;

    // O mapa nasce dentro de um Sheet que abre com animação; sem isso o
    // Leaflet mede a área errada e os tiles ficam cortados.
    setTimeout(() => instancia.invalidateSize(), 250);

    return () => {
      instancia.remove();
      mapa.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Ponto vindo de fora (ex.: endereço salvo sendo editado).
  useEffect(() => {
    if (!mapa.current || lat == null || lng == null) return;
    marcador.current?.setLatLng([lat, lng]);
    mapa.current.setView([lat, lng], Math.max(mapa.current.getZoom(), 16));
  }, [lat, lng]);

  function usarMinhaLocalizacao() {
    if (!navigator.geolocation) {
      setErroGps('Seu navegador não informa a localização.');
      return;
    }

    setErroGps(null);
    setBuscando(true);

    navigator.geolocation.getCurrentPosition(
      (posicao) => {
        const { latitude, longitude } = posicao.coords;
        mapa.current?.setView([latitude, longitude], 17);
        mover(latitude, longitude);
      },
      () => {
        setBuscando(false);
        setErroGps('Não conseguimos pegar sua localização. Marque no mapa.');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  return (
    <div className={className}>
      <div className="relative overflow-hidden rounded-card border border-line">
        <div ref={container} className="h-56 w-full bg-ink-500" />

        <button
          type="button"
          onClick={usarMinhaLocalizacao}
          className="absolute right-3 top-3 z-[400] flex items-center gap-1.5 rounded-lg bg-ink-600 px-2.5 py-2 text-xs font-medium text-cream shadow-lg hover:bg-ink-300"
        >
          {buscando ? <Loader2 size={14} className="animate-spin" /> : <Crosshair size={14} />}
          Minha localização
        </button>
      </div>

      <p className="mt-1.5 flex items-start gap-1.5 text-[11px] text-cream-faint">
        <MapPin size={12} className="mt-0.5 shrink-0" />
        Toque no mapa ou arraste o pino até a porta de entrada. É por aqui que o entregador
        se orienta.
      </p>

      {erroGps && <p className="mt-1 text-[11px] text-danger">{erroGps}</p>}
    </div>
  );
}
