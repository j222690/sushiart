import clsx from 'clsx';

/**
 * Hanko (判子) — o selo vermelho redondo que no Japão vale como assinatura.
 *
 * Usa o vinho que já é da marca, então entra no app sem abrir uma cor nova.
 * Serve em dois lugares e os dois importam:
 *
 *   - `animar` ligado, no "pedido confirmado": o carimbo bate na tela como
 *     bateria no papel. É o momento em que o cliente quer sentir que deu certo.
 *   - `animar` desligado, na cartela de fidelidade: cada pedido vira um selo,
 *     e a cartela cheia troca por um brinde.
 *
 * A inclinação é de propósito. Carimbo alinhado no eixo lê como logotipo;
 * torto lê como carimbo batido por uma pessoa.
 */
export default function Hanko({
  texto = '認',
  size = 64,
  animar = false,
  apagado = false,
  className,
}) {
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size, fontSize: size * 0.42 }}
      className={clsx(
        'inline-grid shrink-0 select-none place-items-center rounded-full font-brand leading-none',
        // A borda grossa é o que faz parecer tinta prensada, e não texto
        // vermelho dentro de um círculo.
        'border-[3px]',
        apagado
          ? // Espaço ainda não carimbado da cartela: fica como marca d'água,
            // para a pessoa ver quantos faltam sem achar que já ganhou.
            'border-dashed border-vinho/25 text-vinho/25'
          : 'border-vinho text-vinho',
        animar ? 'animate-carimba' : '-rotate-[8deg]',
        className
      )}
    >
      {texto}
    </span>
  );
}
