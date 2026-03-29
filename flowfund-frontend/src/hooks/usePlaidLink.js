import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePlaidLink as usePlaidSdkLink } from 'react-plaid-link';
import { createLinkToken, exchangePublicToken } from '../api/plaid';

export default function usePlaidLink(onLinked) {
  const [linkToken, setLinkToken] = useState('');
  const [loadingToken, setLoadingToken] = useState(false);
  const [linking, setLinking] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const fetchLinkToken = useCallback(async () => {
    setLoadingToken(true);
    setError('');
    try {
      const { data } = await createLinkToken();
      setLinkToken(data.link_token || '');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to prepare bank linking.');
    } finally {
      setLoadingToken(false);
    }
  }, []);

  useEffect(() => {
    fetchLinkToken();
  }, [fetchLinkToken]);

  const onSuccess = useCallback(
    async (public_token) => {
      setLinking(true);
      setError('');
      setSuccessMessage('');
      try {
        await exchangePublicToken(public_token);
        setSuccessMessage('Bank account linked successfully.');
        if (onLinked) {
          await onLinked();
        }
        await fetchLinkToken();
      } catch (err) {
        setError(err.response?.data?.error || 'Failed to complete bank linking.');
      } finally {
        setLinking(false);
      }
    },
    [fetchLinkToken, onLinked]
  );

  const onExit = useCallback((err) => {
    if (err?.display_message || err?.error_message) {
      setError(err.display_message || err.error_message);
    }
  }, []);

  const { open, ready } = usePlaidSdkLink({
    token: linkToken || null,
    onSuccess,
    onExit,
  });

  const openPlaid = useCallback(() => {
    setError('');
    setSuccessMessage('');
    if (!ready) {
      setError('Plaid is still loading. Please try again in a moment.');
      return;
    }
    open();
  }, [open, ready]);

  return useMemo(
    () => ({
      openPlaid,
      ready,
      loadingToken,
      linking,
      error,
      successMessage,
      retryLinkToken: fetchLinkToken,
    }),
    [openPlaid, ready, loadingToken, linking, error, successMessage, fetchLinkToken]
  );
}
