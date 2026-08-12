# Worker de lembretes — MyDesk-Colab

Este Worker está isolado do ambiente original. Ele não tem cron ativo, não
inclui secrets e usa um nome diferente no Cloudflare.

Por padrão, tarefas agendadas e envio de e-mail ficam desligados. Para testar,
use apenas uma conta Cloudflare, um projeto Firebase e uma conta Resend de
desenvolvimento próprios. Copie `.dev.vars.example` para `.dev.vars` e nunca
use credenciais, URLs, remetentes ou Worker do MyDesk de produção.

O Worker bloqueia a configuração Firebase conhecida de produção e remetentes
`@mydesk.social`. Para habilitar um teste explícito, defina os flags locais
indicados no template e configure um cron somente no Worker isolado.

Não execute `wrangler deploy` apontando para uma conta ou Worker de produção.
