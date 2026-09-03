import { useEffect, useState } from 'react';
import { Star } from 'lucide-react';
import clsx from 'clsx';
import { Button, Card, Textarea } from './ui';
import { reviews } from '../lib/api';
import { useToast } from '../context/ToastContext';

/**
 * Avaliação depois da entrega.
 *
 * Duas coisas de uma vez: a nota que ajuda a vender e um motivo para a pessoa
 * voltar ao app. E a cozinha descobre qual peça está saindo ruim antes de o
 * cliente sumir sem dizer por quê.
 *
 * Só aparece em pedido entregue — o banco recusa qualquer outro caso, e a tela
 * concorda com ele em vez de deixar o botão lá para o cliente descobrir o erro
 * depois de escrever um comentário inteiro.
 */
export default function AvaliarPedido({ order, customerId }) {
  const toast = useToast();
  const [avaliacao, setAvaliacao] = useState(undefined); // undefined = carregando
  const [nota, setNota] = useState(0);
  const [comentario, setComentario] = useState('');
  const [enviando, setEnviando] = useState(false);

  const podeAvaliar = order?.status === 'entregue';

  useEffect(() => {
    if (!podeAvaliar) return;
    reviews
      .forOrder(order.id)
      .then(setAvaliacao)
      .catch(() => setAvaliacao(null));
  }, [order?.id, podeAvaliar]);

  if (!podeAvaliar || avaliacao === undefined) return null;

  // Já avaliou: mostra a nota que deu, em vez de sumir. Ver a própria nota
  // confirma que o envio funcionou.
  if (avaliacao) {
    return (
      <Card className="mb-4 p-4">
        <p className="text-sm font-semibold text-cream">Sua avaliação</p>
        <div className="mt-1.5 flex gap-0.5">
          {[1, 2, 3, 4, 5].map((n) => (
            <Star
              key={n}
              size={18}
              className={n <= avaliacao.rating ? 'fill-ember text-ember' : 'text-ink-50'}
            />
          ))}
        </div>
        {avaliacao.comment && (
          <p className="mt-2 text-sm text-cream-muted">{avaliacao.comment}</p>
        )}
      </Card>
    );
  }

  async function enviar() {
    setEnviando(true);
    try {
      const criada = await reviews.create({
        orderId: order.id,
        customerId,
        rating: nota,
        comment: comentario,
      });
      setAvaliacao(criada);
      toast.success('Obrigado pela avaliação!');
    } catch (error) {
      toast.error(error.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Card className="mb-4 p-4">
      <p className="text-sm font-semibold text-cream">Como foi seu pedido?</p>
      <p className="mt-0.5 text-xs text-cream-muted">
        Sua nota ajuda a cozinha a acertar o próximo.
      </p>

      <div className="mt-3 flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setNota(n)}
            aria-label={`${n} ${n === 1 ? 'estrela' : 'estrelas'}`}
            aria-pressed={nota === n}
            className="rounded-lg p-1 transition-transform active:scale-90"
          >
            <Star
              size={30}
              className={clsx(
                'transition-colors',
                n <= nota ? 'fill-ember text-ember' : 'text-ink-50'
              )}
            />
          </button>
        ))}
      </div>

      {/* O campo de comentário só abre depois da nota: pedir texto antes da
          estrela é pedir trabalho antes de a pessoa ter decidido opinar. */}
      {nota > 0 && (
        <div className="mt-3 animate-fade-in">
          <Textarea
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
            maxLength={300}
            rows={3}
            placeholder={
              nota >= 4
                ? 'O que você mais gostou? (opcional)'
                : 'O que podemos melhorar? (opcional)'
            }
          />
          <Button className="mt-2 w-full" loading={enviando} onClick={enviar}>
            Enviar avaliação
          </Button>
        </div>
      )}
    </Card>
  );
}
