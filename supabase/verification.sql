-- Vérifier les tables principales et l'activation RLS
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
order by tablename;

-- Vérifier le profil du propriétaire après connexion Auth
select id, full_name, email, role, is_active
from public.profiles
where lower(email) = lower('ninon.hermellon13@gmail.com');
