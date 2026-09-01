import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ScrollText } from 'lucide-react';
import { useStore } from '../../context/StoreContext';
import PaginaLegal, { Secao } from '../../components/PaginaLegal';
import { formatBRL } from '../../lib/format';

/**
 * Termos de uso.
 *
 * Descrevem o que o app realmente faz: pedido só sai depois de confirmado pela
 * cozinha, cupom tem mínimo, roleta dá um giro por dia. Regra escrita aqui que
 * o sistema não cumpre vira reclamação com razão — então cada uma delas
 * corresponde a algo que existe no código.
 */
export default function Termos() {
  const navigate = useNavigate();
  const { restaurant } = useStore();

  const contato = restaurant?.whatsapp || restaurant?.phone;
  const minimo = restaurant?.min_order_cents;

  return (
    <PaginaLegal
      titulo="Termos de Uso"
      icone={ScrollText}
      atualizadoEm="1º de setembro de 2026"
      voltar={() => navigate(-1)}
      voltarIcone={ArrowLeft}
    >
      <Secao titulo="O que é este aplicativo">
        <p>
          Um canal de pedidos do <strong>{restaurant?.name || 'Sushi Art — Empório do Sushi'}</strong>,
          em {restaurant?.address_city || 'Chapecó'}/{restaurant?.address_state || 'SC'}. Quem prepara,
          entrega e responde pelo pedido é o próprio restaurante — não há intermediário.
        </p>
        <p>Ao fazer um pedido, você concorda com o que está escrito aqui.</p>
      </Secao>

      <Secao titulo="Sua conta">
        <p>
          Para pedir, é preciso ter conta. Informe dados verdadeiros: <strong>endereço errado ou
          telefone que não atende</strong> são a causa mais comum de pedido que não chega.
        </p>
        <p>Você é responsável por manter sua senha em segurança.</p>
      </Secao>

      <Secao titulo="Pedidos">
        <ul>
          <li>
            O pedido só é confirmado <strong>depois que a cozinha aceita</strong>. Até lá ele
            aparece como aguardando.
          </li>
          <li>
            O tempo de entrega mostrado é uma <strong>estimativa</strong>. Movimento, chuva e
            distância mudam esse número.
          </li>
          <li>
            Só atendemos dentro da <strong>área de entrega</strong> mostrada no mapa. A taxa varia
            conforme o bairro e aparece antes de você confirmar.
          </li>
          {minimo > 0 && (
            <li>
              Há pedido mínimo de <strong>{formatBRL(minimo)}</strong> para entrega.
            </li>
          )}
          <li>
            Fora do horário de funcionamento você pode montar o carrinho, mas o pedido só entra
            quando abrirmos.
          </li>
        </ul>
      </Secao>

      <Secao titulo="Pagamento">
        <p>
          Você pode pagar online ou na entrega. No pagamento online, a cobrança é feita pela
          operadora — nós apenas recebemos a confirmação.
        </p>
        <p>
          Se escolher dinheiro, informe se precisa de troco e para quanto: o entregador leva o
          troco combinado.
        </p>
      </Secao>

      <Secao titulo="Cupons e roleta">
        <ul>
          <li>Cada cupom tem <strong>valor mínimo de pedido</strong>, mostrado junto do cupom.</li>
          <li>Cupons têm <strong>prazo de validade</strong> e valem uma vez por cliente.</li>
          <li>A roleta dá <strong>um giro por dia</strong>. O prêmio vira um cupom pessoal, com prazo curto.</li>
          <li>Não é possível somar dois cupons no mesmo pedido.</li>
          <li>Prêmios e cupons não valem dinheiro e não são trocáveis por dinheiro.</li>
        </ul>
      </Secao>

      <Secao titulo="Cancelamento e troca">
        <p>
          Dá para cancelar <strong>enquanto a cozinha não começou a preparar</strong>. Depois disso
          a comida já está sendo feita, e o cancelamento depende de falar com a gente.
        </p>
        <p>
          Deu algum problema com o pedido — item faltando, errado ou fora do padrão? Fale com o
          restaurante{contato ? <> pelo <strong>{contato}</strong></> : ''} no mesmo dia, que a
          gente resolve.
        </p>
        <p>
          Como comida é produto perecível e preparado sob encomenda, não se aplica o prazo de
          arrependimento de 7 dias previsto para compras online.
        </p>
      </Secao>

      <Secao titulo="Fotos e cardápio">
        <p>
          As fotos são ilustrativas: o prato montado pode variar um pouco na aparência. Já o
          conteúdo descrito — as peças, os ingredientes e as quantidades — é o que você recebe.
        </p>
        <p>Preços e itens podem mudar sem aviso. Vale sempre o que está no app na hora do pedido.</p>
      </Secao>

      <Secao titulo="Alergias e restrições">
        <p>
          Nossos pratos levam <strong>peixe cru, frutos do mar, leite, ovo, glúten e gergelim</strong>,
          e são preparados na mesma cozinha. Não conseguimos garantir ausência de traços.
        </p>
        <p>
          Se você tem alergia, avise no campo de observação do pedido <strong>e</strong> fale com a
          gente antes de confirmar.
        </p>
      </Secao>

      <Secao titulo="Mudanças nestes termos">
        <p>
          Podemos atualizar este texto. A data no topo mostra a última alteração, e vale a versão
          publicada no momento do seu pedido.
        </p>
      </Secao>

      <Secao titulo="Contato">
        <p>
          {restaurant?.name || 'Sushi Art — Empório do Sushi'}
          {contato ? <> · <strong>{contato}</strong></> : ''}
        </p>
      </Secao>
    </PaginaLegal>
  );
}
