# Configuração do Supabase

O site é estático no GitHub Pages. O Supabase fornece o armazenamento
compartilhado e valida as permissões do painel administrativo.

## Configuração inicial

1. No painel do projeto Supabase, abra **SQL Editor** e execute
   [`supabase/setup.sql`](./supabase/setup.sql).
   Se o banco já estiver configurado, execute novamente o arquivo para liberar
   o envio anônimo de sugestões de pontos, aplicar a revisão pelo painel
   administrativo, desativar as permissões do questionário antigo e remover
   seis pontos de exemplo antigos e o registro de exemplo MP.3. Outros pontos
   cadastrados são preservados.
2. Em **Authentication → Users**, crie o usuário `adm@uefs.ecomp.tfh` e
   configure a senha administrativa diretamente no Supabase. A senha não deve
   ser colocada neste repositório.
3. No SQL Editor, execute o bootstrap de administrador que está comentado no
   final de `supabase/setup.sql`. Isso adiciona a conta autenticada à tabela
   protegida de administradores.
4. Confira se [`assets/supabase-config.js`](./assets/supabase-config.js) contém
   a URL do projeto e a chave **publishable/anon**. Essa chave pode ser usada
   pelo site público; nunca coloque uma `service_role` key no frontend.
5. Publique os arquivos no GitHub Pages. Teste o acesso administrativo antes de
   divulgar o painel.

## Dados e privacidade

- O site não oferece login nem cadastro para visitantes; o app usa um perfil
  local genérico e mantém pontuação e progresso neste navegador.
- Pontos, explicações e perguntas publicados no painel ficam no Supabase e
  aparecem para todos os visitantes. Os pontos da UEFS precisam ser cadastrados
  com coordenadas confirmadas; nenhum local é inventado pela aplicação.
- Visitantes podem enviar sugestões anônimas de pontos. Elas ficam pendentes e
  somente administradores autorizados podem consultá-las ou atualizar seu status.
- A tela administrativa exige uma sessão de senha do Supabase e uma entrada
  correspondente em `public.app_admins`. O e-mail, sozinho, não autoriza acesso.

## Posicionamento no mapa

No formulário de ponto, clique no mapa estilizado para definir as coordenadas.
O posicionamento usa a mesma escala aproximada do mapa personalizado da
aplicação, em relação ao anel central de Feira de Santana. Latitude e longitude
também podem ser ajustadas manualmente. Os pontos publicados aparecem como
marcadores luminosos; os da UEFS usam cor diferente.

O questionário foi removido do site. Se já existirem respostas antigas no
Supabase, `setup.sql` revoga o acesso público e administrativo a essas tabelas,
mas não apaga os dados.
