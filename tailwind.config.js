/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        court: {
          green: "#2d5a3d",
          clay: "#c1552c",
        },
      },
    },
  },
  plugins: [],
};
