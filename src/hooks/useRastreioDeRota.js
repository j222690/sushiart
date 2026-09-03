import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { trackPageView } from '../lib/analytics';

/**
 * Conta uma visualização de página a cada troca de rota.
 *
 * Num app de página única não existe recarga, então o PageView automático do
 * Meta Pixel e do GA4 dispararia uma vez só, na abertura — e todo o resto da
 * navegação ficaria invisível. Por isso os dois provedores entram com o
 * automático DESLIGADO e quem conta é este gancho.
 *
 * A trava do caminho anterior evita o disparo dobrado: em React 18 o modo
 * estrito monta o efeito duas vezes em desenvolvimento, e um `replace` de
 * parâmetro na URL (fechar a ficha de um produto, por exemplo) reexecuta o
 * efeito sem que a pessoa tenha mudado de tela.
 *
 * A comparação é só pelo `pathname`: `/cardapio?produto=X` e `/cardapio` são a
 * mesma tela para efeito de audiência, e contar as duas infla o número sem
 * dizer nada de novo.
 */
export function useRastreioDeRota() {
  const { pathname } = useLocation();
  const anterior = useRef(null);

  useEffect(() => {
    if (anterior.current === pathname) return;
    anterior.current = pathname;
    trackPageView(pathname);
  }, [pathname]);
}
