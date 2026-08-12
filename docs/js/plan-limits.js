'use strict';
/* Limites de plano — fonte única.
   O número vivia apenas dentro do app.js. O painel administrativo precisa do
   mesmo valor para mostrar "5 de 15 notas", e copiá-lo para lá criaria duas
   verdades que sairiam de sincronia no dia em que uma mudasse. Quem precisa
   do limite carrega este arquivo. */
window.MD_PLAN_FREE_LIMIT = 15;   // notas por mês no plano gratuito
