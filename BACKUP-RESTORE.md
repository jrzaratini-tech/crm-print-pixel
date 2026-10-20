# Backup e recuperação do CRM PrintPixel

## Política

- Destino: bucket privado dedicado, diferente do serviço Render.
- Frequência mínima: uma cópia diária e uma cópia adicional antes de migrações.
- Retenção recomendada: 30 cópias diárias, 12 mensais e 7 anuais, configurada pela política de ciclo de vida do bucket.
- Acesso: apenas conta de serviço do CRM e responsáveis técnicos autorizados.
- Monitorização: a automação deve alertar se não existir backup válido nas últimas 26 horas.
- Teste de restauro: trimestral, primeiro em ambiente isolado, com registo da data, responsável, checksum e contagens.

## Criar backup

Configure `FIREBASE_BACKUP_BUCKET` e execute `npm run backup:create`. O ficheiro é comprimido, contém manifesto, contagens e checksum SHA-256.

## Verificar ou restaurar

Configure `FIREBASE_BACKUP_BUCKET` e `FIREBASE_BACKUP_OBJECT` e execute `npm run backup:restore`. Sem `BACKUP_RESTORE_CONFIRM=RESTORE`, o comando apenas descarrega, valida o checksum e apresenta o manifesto.

Uma restauração real deve ser executada primeiro num projeto Firebase de homologação. O processo repõe os documentos presentes no arquivo sem eliminar documentos adicionais; saneamento destrutivo exige plano e autorização separados.
