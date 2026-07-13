/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{vue,js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                // Primary backgrounds - Pure black per brand manual
                primary: {
                    DEFAULT: '#000000',
                    dark: '#000000',
                },
                // Silver - primary text color
                silver: {
                    DEFAULT: '#FFFFFF',
                    70: 'rgba(255, 255, 255, 0.85)',
                    50: 'rgba(255, 255, 255, 0.7)',
                    30: 'rgba(255, 255, 255, 0.4)',
                    20: 'rgba(255, 255, 255, 0.25)',
                    10: 'rgba(255, 255, 255, 0.15)',
                    5: 'rgba(255, 255, 255, 0.08)',
                },
                // Green accent color
                neon: {
                    DEFAULT: '#5AC168',
                    40: 'rgba(90, 193, 104, 0.4)',
                    15: 'rgba(90, 193, 104, 0.15)',
                    10: 'rgba(90, 193, 104, 0.1)',
                    5: 'rgba(90, 193, 104, 0.05)',
                },
                // Rust - errors, negatives, rejection
                rust: {
                    DEFAULT: '#8B2E1F',
                    10: 'rgba(139, 46, 31, 0.1)',
                    5: 'rgba(139, 46, 31, 0.05)',
                },
                // Warning - tight / caution states (between OK and critical)
                warning: {
                    DEFAULT: '#FACC15', // matches Tailwind yellow-400 for backwards compat
                    40: 'rgba(250, 204, 21, 0.4)',
                    15: 'rgba(250, 204, 21, 0.15)',
                    10: 'rgba(250, 204, 21, 0.1)',
                    5: 'rgba(250, 204, 21, 0.05)',
                },
                // v2 redesign — surface layering (design→app v2 F0, see cranial-design/prototype/DESIGN-DIRECTION.md §2-3)
                surface: {
                    1: 'rgba(255, 255, 255, 0.04)',
                    2: 'rgba(255, 255, 255, 0.07)',
                    3: 'rgba(255, 255, 255, 0.10)',
                },
                // v2 redesign — hairline borders/dividers
                line: {
                    DEFAULT: 'rgba(255, 255, 255, 0.10)',
                    strong: 'rgba(255, 255, 255, 0.18)',
                },
                // v2 redesign — premium accent
                gold: '#D4A843',
                // v2 redesign — sticky header background
                hdr: 'rgba(0, 0, 0, 0.78)',
            },
            fontFamily: {
                sans: ['Open Sans', 'sans-serif'],
                brother: ['Brother', 'sans-serif'],
                // v2 redesign — display typeface for headings/numerics (design→app v2 F0)
                display: ['Space Grotesk', 'sans-serif'],
            },
            fontSize: {
                'h1': ['28px', { lineHeight: '1.3', letterSpacing: '-0.3px', fontWeight: '700' }],
                'h2': ['24px', { lineHeight: '1.3', letterSpacing: '0px', fontWeight: '700' }],
                'h3': ['20px', { lineHeight: '1.4', letterSpacing: '0px', fontWeight: '500' }],
                'h5': ['16px', { lineHeight: '1.5', letterSpacing: '0.3px', fontWeight: '700' }],
                'body': ['16px', { lineHeight: '1.5', letterSpacing: '0.3px' }],
                'small': ['14px', { lineHeight: '1.5', letterSpacing: '0.2px' }],
                'tiny': ['14px', { lineHeight: '1.4', letterSpacing: '0.15px' }],
            },
            spacing: {
                'xs': '4px',
                'sm': '8px',
                'md': '16px',
                'lg': '24px',
                'xl': '32px',
                '15': '60px',
            },
            boxShadow: {
                'subtle': '0 2px 4px rgba(0, 0, 0, 0.2)',
                'medium': '0 4px 12px rgba(0, 0, 0, 0.3)',
                'strong': '0 8px 24px rgba(0, 0, 0, 0.4)',
                'glow-strong': '0 0 12px rgba(90, 193, 104, 0.15)',
                // v2 redesign — focus/highlight glow (design→app v2 F0)
                'glow-neon': '0 0 0 1px rgba(90, 193, 104, 0.35), 0 0 18px rgba(90, 193, 104, 0.18)',
            },
            borderRadius: {
                'none': '0px',
                'sm': '2px',
                'DEFAULT': '3px',
                'md': '4px',
                'lg': '6px',
                'xl': '8px',
                'full': '9999px',
            },
            minHeight: {
                '44': '44px',
            },
            minWidth: {
                '44': '44px',
            },
            transitionTimingFunction: {
                // v2 redesign — standard ease for motion (design→app v2 F0)
                'v2': 'cubic-bezier(0.2, 0.7, 0.3, 1)',
            },
        },
    },
    plugins: [],
}