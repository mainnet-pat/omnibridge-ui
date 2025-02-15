import { SafeAppWeb3Modal as Web3Modal } from '@gnosis.pm/safe-apps-web3modal';
import WalletConnectProvider from '@walletconnect/web3-provider';
import coinbaseLogo from 'assets/coinbase.svg';
import imTokenLogo from 'assets/imtoken.svg';
import { ethers } from 'ethers';
import { isSanctionedByChainalysis } from 'lib/chainalysis';
import {
  getNetworkName,
  getRPCUrl,
  getWalletProviderName,
  logError,
} from 'lib/helpers';
import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { WalletLink } from 'walletlink';

export const Web3Context = React.createContext({});
export const useWeb3Context = () => useContext(Web3Context);

const updateTitle = chainId => {
  const networkName = getNetworkName(chainId);
  const defaultTitle = 'OmniBridge';
  if (!process.env.REACT_APP_TITLE) {
    document.title = defaultTitle;
  } else {
    const titleReplaceString = '%c';
    const appTitle = process.env.REACT_APP_TITLE || defaultTitle;

    if (appTitle.indexOf(titleReplaceString) !== -1) {
      document.title = appTitle.replace(titleReplaceString, networkName);
    } else {
      document.title = appTitle;
    }
  }
};

const rpc = {
  // 1: getRPCUrl(1),
  4: getRPCUrl(4),
  // 42: getRPCUrl(42),
  // 100: getRPCUrl(100),
  // 77: getRPCUrl(77),
  // 56: getRPCUrl(56),
  // 10000: getRPCUrl(10000),
  10001: getRPCUrl(10001),
};

const connector = async (ProviderPackage, options) => {
  const provider = new ProviderPackage(options);
  await provider.enable();
  return provider;
};

const providerOptions = {
  walletconnect: {
    package: WalletConnectProvider,
    options: { rpc },
  },
  'custom-imToken': {
    display: {
      logo: imTokenLogo,
      name: 'imToken',
      description: 'Connect to your imToken Wallet',
    },
    package: WalletConnectProvider,
    options: { rpc },
    connector,
  },
  'custom-walletlink': {
    display: {
      logo: coinbaseLogo,
      name: 'Coinbase',
      description: 'Scan with Coinbase Wallet to connect',
    },
    options: {
      appName: 'OmniBridge',
    },
    package: WalletLink,
    connector: async (WalletLinkPackage, options) => {
      const { appName } = options;
      const walletLink = new WalletLinkPackage({
        appName,
      });
      const provider = walletLink.makeWeb3Provider({}, 0);
      await provider.enable();
      return provider;
    },
  },
};

const web3Modal = new Web3Modal({
  cacheProvider: true,
  providerOptions,
});

export const Web3Provider = ({ children }) => {
  const [
    { providerChainId, ethersProvider, account, isSanctioned },
    setWeb3State,
  ] = useState({});
  const [isGnosisSafe, setGnosisSafe] = useState(false);
  const [loading, setLoading] = useState(true);

  const setWeb3Provider = useCallback(async prov => {
    try {
      const provider = new ethers.providers.Web3Provider(prov);
      const address = await provider.getSigner().getAddress();
      setWeb3State({
        account: address,
        ethersProvider: provider,
        providerChainId: (await provider.getNetwork()).chainId,
        isSanctioned: await isSanctionedByChainalysis(address),
      });
    } catch (error) {
      logError({ web3ModalError: error });
    }
  }, []);

  useEffect(() => {
    if (providerChainId) {
      updateTitle(providerChainId);
    }
  }, [providerChainId]);

  const disconnect = useCallback(async () => {
    web3Modal.clearCachedProvider();
    setGnosisSafe(false);
    setWeb3State({});
  }, []);

  const connectWeb3 = useCallback(async () => {
    try {
      setLoading(true);

      const modalProvider = await web3Modal.requestProvider();

      await setWeb3Provider(modalProvider);

      const gnosisSafe = await web3Modal.isSafeApp();
      setGnosisSafe(gnosisSafe);

      if (!gnosisSafe) {
        modalProvider.on('accountsChanged', async () => {
          setLoading(true);
          await setWeb3Provider(modalProvider);
          setLoading(false);
        });
        modalProvider.on('chainChanged', async () => {
          setLoading(true);
          await setWeb3Provider(modalProvider);
          setLoading(false);
        });
      }
    } catch (error) {
      logError({ web3ModalError: error });
      disconnect();
    } finally {
      setLoading(false);
    }
  }, [setWeb3Provider, disconnect]);

  useEffect(() => {
    if (window.ethereum) {
      window.ethereum.autoRefreshOnNetworkChange = false;
    }
    (async function load() {
      if ((await web3Modal.isSafeApp()) || web3Modal.cachedProvider) {
        connectWeb3();
      } else {
        setLoading(false);
      }
    })();
  }, [connectWeb3]);

  const isMetamask = useMemo(
    () =>
      getWalletProviderName(ethersProvider) === 'metamask' &&
      window.ethereum?.isMetaMask === true,
    [ethersProvider],
  );

  const isConnected = useMemo(
    () => !!account && !!providerChainId && !!ethersProvider,
    [account, providerChainId, ethersProvider],
  );

  const web3Context = useMemo(
    () => ({
      isGnosisSafe,
      ethersProvider,
      connectWeb3,
      loading,
      disconnect,
      providerChainId,
      account,
      isMetamask,
      isConnected,
      isSanctioned: isSanctioned ?? false,
    }),
    [
      isGnosisSafe,
      ethersProvider,
      connectWeb3,
      loading,
      disconnect,
      providerChainId,
      account,
      isMetamask,
      isConnected,
      isSanctioned,
    ],
  );

  return (
    <Web3Context.Provider value={web3Context}>{children}</Web3Context.Provider>
  );
};
