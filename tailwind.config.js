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
        'ink-fade': 'linear-gradient(180deg, rgba(246,243,239,0) 0%, rgba(246,243,239,0.97) 75%)',
        'ember-glow': 'radial-gradient(circle at 50% 0%, rgba(176,106,44,0.10) 0%, transparent 60%)',
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
      },
      animation: {
        'slide-up': 'slide-up 260ms cubic-bezier(0.16, 1, 0.3, 1)',
        'fade-in': 'fade-in 200ms ease-out',
        'pulse-glow': 'pulseGlow 2.4s ease-in-out infinite',
        shimmer: 'shimmer 1.6s infinite',
      },
    },
  },
  plugins: [],
};
