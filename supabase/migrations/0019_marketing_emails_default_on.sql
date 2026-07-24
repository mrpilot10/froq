-- Marketing emails are opt-out: new merchants have them enabled by default.
alter table merchants
  alter column marketing_emails set default true;
