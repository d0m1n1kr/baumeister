import { mount } from 'svelte';
import './app.css';
import App from './ui/App.svelte';

const app = mount(App, { target: document.getElementById('app')! });

// Lade-Splash (index.html) weich ausblenden, sobald die App steht
const splash = document.getElementById('splash');
if (splash) {
  splash.classList.add('done');
  setTimeout(() => splash.remove(), 500);
}

export default app;
