-- handle_new_user() only ever runs from the on_auth_user_created trigger, which
-- executes as the table owner. Leaving EXECUTE granted to anon/authenticated
-- would also expose it as POST /rest/v1/rpc/handle_new_user.
revoke execute on function public.handle_new_user() from anon, authenticated, public;
