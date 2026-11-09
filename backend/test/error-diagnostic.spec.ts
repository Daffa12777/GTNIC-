import { errorDiagnostic } from '../src/db/error-diagnostic';

it('classifies pool exhaustion without logging the raw driver message or connection string', () => {
  const error = { code: 'P2039', message: 'Database failure postgres://user:secret@host/db', meta: { driverAdapterError: { cause: { originalCode: 'XX000', originalMessage: 'MaxClientsInSessionMode: max clients reached - in Session mode max clients are limited to pool_size' } } } };
  expect(errorDiagnostic(error)).toBe('code=P2039, databaseCode=XX000, reason=session_pool_full');
  expect(errorDiagnostic({ code: 'password=secret', message: 'secret' })).toBe('code=unknown, databaseCode=unknown, reason=unknown');
  expect(errorDiagnostic(null)).toBe('code=unknown, databaseCode=unknown, reason=unknown');
});
