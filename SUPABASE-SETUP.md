# Configuração do Supabase

O site é estático no GitHub Pages. O Supabase fornece o armazenamento
compartilhado e valida as permissões do painel administrativo.

## Configuração inicial

1. No painel do projeto Supabase, abra **SQL Editor** e execute
   [`supabase/setup.sql`](./supabase/setup.sql).
2. Em **Authentication → Users**, crie o usuário `adm@uefs.ecomp.tfh` e
   configure a senha administrativa diretamente no Supabase. A senha não deve
   ser colocada neste repositório.
3. No SQL Editor, execute o bootstrap de administrador que está comentado no
   final de `supabase/setup.sql`. Isso adiciona a conta autenticada à tabela
   protegida de administradores.
4. Confira se [`assets/supabase-config.js`](./assets/supabase-config.js) contém
   a URL do projeto e a chave **publishable/anon**. Essa chave pode ser usada
   pelo site público; nunca coloque uma `service_role` key no frontend.
5. Publique os arquivos no GitHub Pages. Teste a criação de conta
   administrativa antes de divulgar o painel.

## Dados e privacidade

- As respostas do questionário não incluem nome, e-mail, ID de usuário ou
  localização GPS. O painel administrativo consulta apenas agrupamentos e
  contagens; não recebe acesso aos perfis ou descartes individuais.
- O acesso comum do app continua usando o perfil local já existente. Por isso,
  a conclusão do questionário é lembrada por perfil neste navegador; outro
  dispositivo ou a limpeza dos dados do navegador poderá solicitá-lo novamente.
- O campo de sugestão de local é texto livre. A tela pede que não sejam
  informados dados pessoais; use-o apenas para nome ou endereço de pontos.
- Pontos, explicações e perguntas publicados no painel ficam no Supabase e
  aparecem para todos os visitantes. Os pontos da UEFS precisam ser cadastrados
  com coordenadas confirmadas; nenhum local é inventado pela aplicação.
- A tela administrativa exige uma sessão de senha do Supabase e uma entrada
  correspondente em `public.app_admins`. O e-mail, sozinho, não autoriza acesso.

## Posicionamento no mapa

No formulário de ponto, clique no mapa estilizado para definir as coordenadas.
O posicionamento usa a mesma escala aproximada do mapa personalizado da
aplicação, em relação ao anel central de Feira de Santana. Latitude e longitude
também podem ser ajustadas manualmente. Os pontos publicados aparecem como
marcadores luminosos; os da UEFS usam cor diferente.

## Limites do questionário

Se o Supabase estiver temporariamente indisponível, o questionário permite
continuar e guarda a resposta anônima pendente apenas no navegador. Ela será
reenviada quando houver conexão; não é sincronizada entre dispositivos antes
do envio.
