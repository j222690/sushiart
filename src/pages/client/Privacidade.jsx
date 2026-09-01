import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { useStore } from '../../context/StoreContext';
import PaginaLegal, { Secao } from '../../components/PaginaLegal';

/**
 * Política de privacidade.
 *
 * Pública e sem login de propósito: o Google exige o link no cadastro do OAuth,
 * e quem ainda está decidindo se cria conta precisa poder ler antes.
 *
 * O texto descreve o que este app realmente faz — os campos são os das tabelas
 * `customers`, `addresses` e `push_tokens`. Política genérica copiada da
 * internet costuma prometer o que o sistema não cumpre, e prometer errado é
 * pior do que não prometer.
 */
export default function Privacidade() {
  const navigate = useNavigate();
  const { restaurant } = useStore();

  const contato = restaurant?.whatsapp || restaurant?.phone;

  return (
    <PaginaLegal
      titulo="Política de Privacidade"
      icone={ShieldCheck}
      atualizadoEm="1º de setembro de 2026"
      voltar={() => navigate(-1)}
      voltarIcone={ArrowLeft}
    >
      <Secao titulo="Quem somos">
        <p>
          Este aplicativo é do <strong>{restaurant?.name || 'Sushi Art — Empório do Sushi'}</strong>,
          restaurante em {restaurant?.address_city || 'Chapecó'}/{restaurant?.address_state || 'SC'}.
          Ele existe para você pedir comida direto da casa, sem intermediário.
        </p>
      </Secao>

      <Secao titulo="O que guardamos">
        <p>Só o necessário para entregar seu pedido:</p>
        <ul>
          <li><strong>Nome, e-mail e telefone</strong> — para identificar seu pedido e falar com você sobre a entrega.</li>
          <li><strong>Endereço de entrega</strong>, incluindo a localização que você marca no mapa — para o entregador chegar e para calcular a taxa do seu bairro.</li>
          <li><strong>Seus pedidos</strong> — o que você pediu, quando e quanto pagou.</li>
          <li><strong>Data de nascimento</strong>, se você quiser informar — usada apenas para felicitações e ofertas de aniversário.</li>
          <li><strong>Autorização de notificação</strong>, se você permitir — para avisar quando o pedido sair.</li>
        </ul>
        <p>
          Não pedimos CPF, não guardamos dados de cartão e não rastreamos você fora deste aplicativo.
        </p>
      </Secao>

      <Secao titulo="Entrar com o Google">
        <p>
          Se você escolher entrar com o Google, recebemos apenas o <strong>seu nome e seu
          e-mail</strong>. Nada além disso: não temos acesso aos seus contatos, à sua agenda,
          aos seus arquivos nem a qualquer outro serviço da sua conta Google.
        </p>
        <p>
          Você pode revogar esse acesso quando quiser, na página de segurança da sua conta Google.
        </p>
      </Secao>

      <Secao titulo="Pagamento">
        <p>
          <strong>Nós não vemos e não guardamos os dados do seu cartão.</strong> Quando você paga
          online, os dados vão direto para a operadora de pagamento, que é quem processa a cobrança.
          Recebemos de volta apenas a confirmação de que o pagamento foi aprovado, o valor e os
          últimos dígitos do cartão.
        </p>
      </Secao>

      <Secao titulo="Com quem compartilhamos">
        <p>Com ninguém para fins de propaganda. Seus dados passam apenas por:</p>
        <ul>
          <li><strong>A operadora de pagamento</strong> que você escolher, para cobrar o pedido.</li>
          <li><strong>Nosso provedor de tecnologia</strong>, que hospeda o aplicativo e o banco de dados.</li>
          <li><strong>O entregador</strong>, que recebe seu endereço e telefone para entregar.</li>
        </ul>
        <p>Não vendemos seus dados. Nunca.</p>
      </Secao>

      <Secao titulo="Seus direitos">
        <p>
          Pela Lei Geral de Proteção de Dados, você pode pedir a qualquer momento para
          <strong> ver, corrigir ou apagar</strong> seus dados, e para deixar de receber
          nossas mensagens promocionais.
        </p>
        <p>
          Nome, telefone e endereços você mesmo altera no aplicativo, em Perfil. Para apagar sua
          conta inteira, fale com a gente{contato ? ` pelo ${contato}` : ''} — apagamos tudo, menos
          o registro fiscal dos pedidos já entregues, que a lei nos obriga a manter.
        </p>
      </Secao>

      <Secao titulo="Por quanto tempo">
        <p>
          Enquanto sua conta existir. Pedidos ficam guardados pelo prazo que a legislação fiscal
          exige. Se você apagar a conta, o resto vai junto.
        </p>
      </Secao>

      <Secao titulo="Contato">
        <p>
          Dúvida sobre seus dados ou pedido para apagá-los? Fale com o
          {' '}{restaurant?.name || 'Sushi Art'}
          {contato ? <> pelo <strong>{contato}</strong></> : ''}.
        </p>
      </Secao>
    </PaginaLegal>
  );
}
