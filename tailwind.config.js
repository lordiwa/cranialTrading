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
                    DEFAULT: '#EEEEEE',
                    70: 'rgba(238, 238, 238, 0.7)',
                    50: 'rgba(238, 238, 238, 0.5)',
                    30: 'rgba(238, 238, 238, 0.3)',
                    20: 'rgba(238, 238, 238, 0.2)',
                    10: 'rgba(238, 238, 238, 0.1)',
                    5: 'rgba(238, 238, 238, 0.05)',
                },
                // Neon Lime - primary accent color
                neon: {
                    DEFAULT: '#CCFF00',
                    40: 'rgba(204, 255, 0, 0.4)',
                    15: 'rgba(204, 255, 0, 0.15)',
                    10: 'rgba(204, 255, 0, 0.1)',
                    5: 'rgba(204, 255, 0, 0.05)',
                },
                // Rust - errors, negatives, rejection
                rust: {
                    DEFAULT: '#8B2E1F',
                    10: 'rgba(139, 46, 31, 0.1)',
                    5: 'rgba(139, 46, 31, 0.05)',
                },
            },
            fontFamily: {
                mono: ['IBM Plex Mono', 'monospace'],
            },
            fontSize: {
                'h1': ['24px', { lineHeight: '1.3', letterSpacing: '-0.3px', fontWeight: '700' }],
                'h2': ['20px', { lineHeight: '1.4', letterSpacing: '0px', fontWeight: '700' }],
                'h3': ['18px', { lineHeight: '1.4', letterSpacing: '0px', fontWeight: '500' }],
                'h5': ['14px', { lineHeight: '1.5', letterSpacing: '0.3px', fontWeight: '700' }],
                'body': ['14px', { lineHeight: '1.5', letterSpacing: '0.3px' }],
                'small': ['12px', { lineHeight: '1.5', letterSpacing: '0.2px' }],
                'tiny': ['11px', { lineHeight: '1.4', letterSpacing: '0.15px' }],
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
                'glow-strong': '0 0 12px rgba(204, 255, 0, 0.15)',
            },
            borderRadius: {
                'none': '0px',
                'DEFAULT': '0px',
            },
            minHeight: {
                '44': '44px',
            },
            minWidth: {
                '44': '44px',
            },
        },
    },
    plugins: [],
}