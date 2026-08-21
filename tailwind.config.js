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
        // Fundo — preto / quase preto
        ink: {
          DEFAULT: '#0D0D0D', // fundo base do app
          50: '#2A2A2A',
          100: '#242424',
          200: '#1E1E1E',
          300: '#1A1A1A',
          400: '#161616',
          500: '#121212', // superfícies elevadas (cards, sheets)
          600: '#0F0F0F',
          700: '#0D0D0D',
          800: '#0A0A0A',
          900: '#050505',
        },
        // Destaque — vermelho vinho / bordô do logo
        vinho: {
          DEFAULT: '#8B2635',
          50: '#F5E4E6',
          100: '#E8C0C5',
          200: '#D3939B',
          300: '#BC6672',
          400: '#A34450',
          500: '#8B2635', // primária (botões, nav ativa, badges)
          600: '#7A2020', // hover / estados pressionados
          700: '#611A1B',
          800: '#471314',
          900: '#2E0C0D',
        },
        // Texto
        cream: {
          DEFAULT: '#F5F1EA', // off-white principal
          muted: '#A8A29A', // texto secundário
          faint: '#6B6660', // texto terciário / placeholders
        },
        // Realces quentes (iluminação ambiente das fotos)
        ember: '#C9803F', // dourado/âmbar para pontos de fidelidade, estrelas
        // Semânticos
        success: '#3FA66A',
        warning: '#D9A441',
        danger: '#D14343',
        // Aliases semânticos de superfície
        surface: {
          DEFAULT: '#121212',
          raised: '#1A1A1A',
          overlay: '#1E1E1E',
          sunken: '#0A0A0A',
        },
        line: 'rgba(245, 241, 234, 0.08)', // divisores sutis
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
        card: '0 2px 12px rgba(0, 0, 0, 0.45)',
        raised: '0 8px 32px rgba(0, 0, 0, 0.6)',
        glow: '0 0 24px rgba(139, 38, 53, 0.35)', // brilho vinho (roleta, CTA)
      },
      backgroundImage: {
        'vinho-gradient': 'linear-gradient(135deg, #8B2635 0%, #611A1B 100%)',
        'ink-fade': 'linear-gradient(180deg, rgba(13,13,13,0) 0%, rgba(13,13,13,0.95) 75%)',
        'ember-glow': 'radial-gradient(circle at 50% 0%, rgba(201,128,63,0.18) 0%, transparent 60%)',
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
          '0%, 100%': { boxShadow: '0 0 16px rgba(139, 38, 53, 0.3)' },
          '50%': { boxShadow: '0 0 32px rgba(139, 38, 53, 0.6)' },
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
