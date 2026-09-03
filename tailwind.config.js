/** @type {import('tailwindcss').Config} */

// ---------------------------------------------------------------------------
// Identidade visual — Sushi Art, Empório do Sushi (@sushiartchapeco)
// Todos os componentes devem consumir estes tokens (bg-ink, text-vinho, ...),
// nunca hex hardcoded. Para ajuste fino de marca, mexa SÓ neste arquivo.
// ---------------------------------------------------------------------------
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // ---------------------------------------------------------------
        // Tema CLARO. Os nomes vieram do tema escuro original e ficaram:
        // `ink` continua sendo "superfície" e `cream` continua sendo "texto"
        // — só que agora ink é claro e cream é escuro. Renomear os dois
        // custaria centenas de linhas alteradas em toda a interface sem
        // mudar um pixel do resultado.
        // ---------------------------------------------------------------

        // Superfícies — branco e cinzas quentes (o "quente" evita o branco
        // clínico e mantém o clima de empório, não de farmácia)
        ink: {
          DEFAULT: '#F6F3EF', // fundo da página
          50: '#E4DDD3',      // bordas fortes, switch desligado
          100: '#FFFFFF',
          200: '#FBF9F6',
          300: '#F1ECE5',     // campos, blocos levemente elevados
          400: '#F8F5F1',
          500: '#FFFFFF',     // cards
          600: '#FFFFFF',     // cabeçalhos fixos
          700: '#F6F3EF',
          800: '#EFEAE3',
          900: '#E7E0D7',
        },
        // Marca — o vinho do logo, agora sobre claro
        vinho: {
          DEFAULT: '#8B2635',
          // 100–300 eram tons PÁLIDOS, feitos para brilhar no fundo preto.
          // Como texto sobre branco eles sumiriam, então viraram tons
          // escuros: o papel deles no layout é o mesmo (destaque legível).
          50: '#FBF0F1',
          100: '#A34450',
          200: '#8B2635',
          300: '#7A2020',
          400: '#A34450',
          500: '#8B2635', // primária — botões, nav ativa, badges
          600: '#7A2020', // hover
          700: '#611A1B',
          800: '#F5DFE2',
          900: '#EBC9CD', // usado com /30 como realce suave (não lido)
        },
        // Texto
        cream: {
          DEFAULT: '#211D1B', // principal
          muted: '#6A625B',   // secundário
          faint: '#9C948B',   // terciário, placeholders
        },
        // Índigo aizome — a cor do Japão do dia a dia (noren, uniforme, louça).
        // Entra como secundária ao lado do vinho, sem disputar com ele: o vinho
        // continua sendo quem chama para a ação (botão, preço, nav ativa) e o
        // aizome carrega a atmosfera (cortina, textura, cabeçalho de seção).
        // Separar os papéis é o que evita as duas cores brigando na mesma tela.
        aizome: {
          DEFAULT: '#22405E',
          50: '#EEF2F7',
          100: '#DDE4EC',
          200: '#B9C7D8',
          300: '#8CA6C1',
          400: '#5A7A9C',
          500: '#22405E', // primária do índigo
          600: '#1B3450',
          700: '#152941',
          800: '#101F31',
          900: '#0B1622',
        },
        // Realce quente — escurecido para ter contraste sobre branco
        ember: '#B06A2C',
        // Semânticos — todos escurecidos pelo mesmo motivo
        success: '#2E8B57',
        warning: '#B0791A',
        danger: '#C62828',
        surface: {
          DEFAULT: '#FFFFFF',
          raised: '#FBF9F6',
          overlay: '#FFFFFF',
          sunken: '#F1ECE5',
        },
        line: 'rgba(33, 29, 27, 0.10)',
      },
      fontFamily: {
        // Título/marca — toque caligráfico elegante
        brand: ['"Playfair Display"', 'Georgia', 'serif'],
        script: ['"Great Vibes"', '"Playfair Display"', 'cursive'],
        // Interface — sans limpa, alta legibilidade em preços e botões
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
      borderRadius: {
        card: '1rem',
        sheet: '1.5rem',
      },
      boxShadow: {
        card: '0 1px 2px rgba(33, 29, 27, 0.05), 0 1px 3px rgba(33, 29, 27, 0.08)',
        raised: '0 8px 28px rgba(33, 29, 27, 0.12)',
        glow: '0 0 24px rgba(139, 38, 53, 0.18)', // brilho vinho (roleta, CTA)
      },
      backgroundImage: {
        'vinho-gradient': 'linear-gradient(135deg, #8B2635 0%, #611A1B 100%)',
        'aizome-gradient': 'linear-gradient(135deg, #22405E 0%, #152941 100%)',
        'ink-fade': 'linear-gradient(180deg, rgba(246,243,239,0) 0%, rgba(246,243,239,0.97) 75%)',
        'ember-glow': 'radial-gradient(circle at 50% 0%, rgba(176,106,44,0.10) 0%, transparent 60%)',

        // Papel washi: três feixes de fibra em ângulos primos entre si, para o
        // olho não achar a repetição. Resolve os cards grandes sem foto —
        // textura em vez de retângulo chapado, custando zero kilobyte.
        //
        // Duas versões porque fibra é sempre um contraste contra o fundo, e
        // fibra escura sobre o vinho do banner simplesmente não aparece: a
        // primeira vez que testei o card continuou chapado. `washi` para
        // superfície clara, `washi-claro` para superfície escura.
        washi: [
          'repeating-linear-gradient(101deg, rgba(139,38,53,0.055) 0 1px, transparent 1px 7px)',
          'repeating-linear-gradient(-77deg, rgba(34,64,94,0.055) 0 1px, transparent 1px 11px)',
          'repeating-linear-gradient(13deg, rgba(176,106,44,0.06) 0 1px, transparent 1px 9px)',
        ].join(','),
        'washi-claro': [
          'repeating-linear-gradient(101deg, rgba(255,255,255,0.10) 0 1px, transparent 1px 7px)',
          'repeating-linear-gradient(-77deg, rgba(255,255,255,0.07) 0 1px, transparent 1px 11px)',
          'repeating-linear-gradient(13deg, rgba(255,226,190,0.10) 0 1px, transparent 1px 9px)',
        ].join(','),

        // Ondas seigaiha (青海波). Fica atrás de cabeçalho e de tela vazia,
        // sempre com opacidade baixa: a 30% vira papel de parede e cansa.
        seigaiha: [
          'radial-gradient(circle at 50% 100%, transparent 32%, currentColor 33%, currentColor 39%, transparent 40%)',
          'radial-gradient(circle at 50% 100%, transparent 18%, currentColor 19%, currentColor 25%, transparent 26%)',
        ].join(','),
      },
      keyframes: {
        'slide-up': {
          '0%': { transform: 'translateY(100%)' },
          '100%': { transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 14px rgba(139, 38, 53, 0.18)' },
          '50%': { boxShadow: '0 0 28px rgba(139, 38, 53, 0.34)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
        // Noren descendo quando a loja abre.
        norenCai: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(0)' },
        },
        // Balanço de brisa nos panos da cortina — 1,5° só. Mais que isso
        // e a cortina vira animação de tela de espera.
        norenBalanca: {
          '0%, 100%': { transform: 'rotate(-0.6deg)' },
          '50%': { transform: 'rotate(0.6deg)' },
        },
        // Carimbo hanko batendo no papel: cai de cima, grande, e assenta.
        carimba: {
          '0%': { opacity: '0', transform: 'scale(2.4) rotate(-24deg)' },
          '60%': { opacity: '1', transform: 'scale(0.92) rotate(-9deg)' },
          '80%': { transform: 'scale(1.04) rotate(-8deg)' },
          '100%': { opacity: '1', transform: 'scale(1) rotate(-8deg)' },
        },
        // Pincelada que revela a marca na abertura.
        pincelada: {
          '0%': { clipPath: 'inset(0 100% 0 0)' },
          '100%': { clipPath: 'inset(0 0 0 0)' },
        },
        girarHashi: {
          '100%': { transform: 'rotate(360deg)' },
        },
        // Pétala caindo: desce girando e sai de lado, como pétala de verdade.
        petala: {
          '0%': { transform: 'translate(0, -10%) rotate(0deg)', opacity: '0' },
          '10%': { opacity: '0.8' },
          '90%': { opacity: '0.8' },
          '100%': { transform: 'translate(40px, 100vh) rotate(420deg)', opacity: '0' },
        },
      },
      animation: {
        'slide-up': 'slide-up 260ms cubic-bezier(0.16, 1, 0.3, 1)',
        'fade-in': 'fade-in 200ms ease-out',
        'pulse-glow': 'pulseGlow 2.4s ease-in-out infinite',
        shimmer: 'shimmer 1.6s infinite',
        'noren-cai': 'norenCai 520ms cubic-bezier(0.16, 1, 0.3, 1)',
        'noren-balanca': 'norenBalanca 5.5s ease-in-out infinite',
        carimba: 'carimba 520ms cubic-bezier(0.16, 1, 0.3, 1) both',
        pincelada: 'pincelada 620ms cubic-bezier(0.65, 0, 0.35, 1) both',
        'girar-hashi': 'girarHashi 1.1s linear infinite',
        petala: 'petala linear infinite',
      },
    },
  },
  plugins: [],
};
