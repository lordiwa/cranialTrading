/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{vue,js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                primary: {
                    DEFAULT: '#0A0E27',
                    dark: '#050711',
                },
                silver: {
                    DEFAULT: '#A8A8A8',
                    70: 'rgba(168, 168, 168, 0.7)',
                    50: 'rgba(168, 168, 168, 0.5)',
                    30: 'rgba(168, 168, 168, 0.3)',
                    20: 'rgba(168, 168, 168, 0.2)',
                    10: 'rgba(168, 168, 168, 0.1)',
                    5: 'rgba(168, 168, 168, 0.05)',
                },
                neon: {
                    DEFAULT: '#39FF14',
                    10: 'rgba(57, 255, 20, 0.1)',
                    5: 'rgba(57, 255, 20, 0.05)',
                },
                rust: {
                    DEFAULT: '#8B2E1F',
                    5: 'rgba(139, 46, 31, 0.05)',
                },
            },
            fontFamily: {
                mono: ['IBM Plex Mono', 'monospace'],
            },
            fontSize: {
                'h1': ['24px', { lineHeight: '1.3', letterSpacing: '-0.3px' }],
                'h2': ['20px', { lineHeight: '1.4', letterSpacing: '0px' }],
                'h3': ['18px', { lineHeight: '1.4', letterSpacing: '0px' }],
                'body': ['14px', { lineHeight: '1.5', letterSpacing: '0.3px' }],
                'small': ['12px', { lineHeight: '1.5', letterSpacing: '0.2px' }],
                'tiny': ['11px', { lineHeight: '1.4', letterSpacing: '0.15px' }],
            },
            boxShadow: {
                'medium': '0 4px 12px rgba(0,0,0,0.3)',
            },
        },
    },
    plugins: [],
}