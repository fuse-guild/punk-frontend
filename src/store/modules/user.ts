import { ethers } from 'ethers';
import tldAbi from "../../abi/PunkTLD.json";
import { useEthers, displayEther, shortenAddress } from 'vue-dapp';

const { address, balance, chainId, signer } = useEthers();

export default {
  namespaced: true,
  
  state: () => ({ 
    selectedName: null, // domain name that appears as the main profile name
    selectedNameData: null,
    selectedNameImageSvg: null,
    selectedNameKey: null,
    userAddress: null,
    userAllDomainNames: [], // all domain names of current user (default + manually added)
    userDomainNamesKey: null,
    userShortAddress: null,
    userBalanceWei: 0,
    userBalance: 0
  }),

  getters: { 
    getUserAddress(state) {
      return state.userAddress;
    },
    
    getUserBalance(state) {
      return state.userBalance;
    },
    getUserBalanceWei(state) {
      return state.userBalanceWei;
    },
    getUserAllDomainNames(state) {
      return state.userAllDomainNames;
    },
    getUserSelectedName(state) {
      return state.selectedName;
    },
    getUserSelectedNameData(state) {
      return state.selectedNameData;
    },
    getUserSelectedNameImageSvg(state) {
      return state.selectedNameImageSvg;
    },
    getUserShortAddress(state) {
      return state.userShortAddress;
    },
  },

  mutations: { 
    addDomainManually(state, domainName) {
      let userDomainNames = [];

      if (chainId.value) {
        this.userDomainNamesKey = "userDomainNames" + String(chainId.value) + String(shortenAddress(address.value));
        this.selectedNameKey = "selectedName" + String(chainId.value) + String(shortenAddress(address.value));

        if (localStorage.getItem(this.userDomainNamesKey)) {
          userDomainNames = JSON.parse(localStorage.getItem(this.userDomainNamesKey));
        }

        if (!userDomainNames.includes(domainName)) {
          userDomainNames.push(domainName);
        }

        for (let udName of userDomainNames) {
          if (!state.userAllDomainNames.includes(udName)) {
            state.userAllDomainNames.push(udName);
          }
        }

        localStorage.setItem(this.userDomainNamesKey, JSON.stringify(userDomainNames));
      }
      
    },

    setUserData(state) {
      state.userAddress = address.value;
      state.userShortAddress = shortenAddress(address.value);
      state.userBalanceWei = balance.value;
      state.userBalance = displayEther(balance.value);
    },

    setDefaultName(state, defName) {
      if (!state.userAllDomainNames.includes(defName)) {
        state.userAllDomainNames.push(defName);
      }
    },

    setSelectedName(state, selectedName) {
      state.selectedName = selectedName;
      localStorage.setItem(this.selectedNameKey, state.selectedName);
    },

    setSelectedNameData(state, nameData) {
      state.selectedNameData = nameData;
    },

    setSelectedNameImageSvg(state, imageSvg) {
      state.selectedNameImageSvg = imageSvg;
    },

    setUserAllDomainNames(state, domains) {
      state.userAllDomainNames = domains;
    }
  },

  actions: { 
    async fetchUserDomainNames({ dispatch, commit, state, rootState }, newAccount) {
      let userDomainNames = [];

      if (chainId.value) {
        this.userDomainNamesKey = "userDomainNames" + String(chainId.value) + String(shortenAddress(address.value));
        this.selectedNameKey = "selectedName" + String(chainId.value) + String(shortenAddress(address.value));
      }

      // reset user data in case there's a switch between accounts
      if (newAccount) {
        if (localStorage.getItem(this.selectedNameKey) && localStorage.getItem(this.selectedNameKey) !== String(null)) {
          commit('setSelectedName', localStorage.getItem(this.selectedNameKey));
        } else {
          commit('setSelectedName', null);
          commit("setSelectedNameData", null);
          commit("setSelectedNameImageSvg", null);
        }

        commit("setUserAllDomainNames", []);
      }
      
      if (localStorage.getItem(this.userDomainNamesKey)) {
        userDomainNames = JSON.parse(localStorage.getItem(this.userDomainNamesKey));
      }

      for (let udName of userDomainNames) {
        commit('setDefaultName', udName);
      }
      
      // fetch user's default names
      for (let tldName of rootState.punk.tlds) {
        const intfc = new ethers.utils.Interface(tldAbi);
        const contract = new ethers.Contract(rootState.punk.tldAddresses[tldName], intfc, signer.value);

        const userDefaultName = await contract.defaultNames(address.value);

        if (userDefaultName) {
          commit('setDefaultName', userDefaultName + tldName);

          if (!userDomainNames.includes(userDefaultName + tldName)) {
            userDomainNames.push(userDefaultName + tldName);
          }

          if (!state.selectedName) {
            commit('setSelectedName', userDefaultName + tldName);
          }
        }
      }

      if (localStorage.getItem(this.selectedNameKey) && localStorage.getItem(this.selectedNameKey) !== String(null)) {
        commit('setSelectedName', localStorage.getItem(this.selectedNameKey));
      } else {
        localStorage.setItem(this.selectedNameKey, state.selectedName);
      }

      localStorage.setItem(this.userDomainNamesKey, JSON.stringify(userDomainNames));
      
      dispatch("fetchSelectedNameData");
    },

    // fetch selectedName data (image etc.)
    async fetchSelectedNameData({commit, state, rootState}) {

      if (state.selectedName) {
        const nameArr = state.selectedName.split(".");
        const name = nameArr[0];
        const domain = "." + nameArr[1];
        
        if (name && rootState.punk.tldAddresses[domain]) {
          const intfc = new ethers.utils.Interface(tldAbi);
          const contract = new ethers.Contract(rootState.punk.tldAddresses[domain], intfc, signer.value);

          const nameData = await contract.domains(name);

          commit("setSelectedNameData", nameData);

          let metadata;
          
          if (nameData.pfpAddress != ethers.constants.AddressZero) {
            // fetch image URL of that PFP
            const pfpInterface = new ethers.utils.Interface([
              "function tokenURI(uint256 tokenId) public view returns (string memory)"
            ]);
            const pfpContract = new ethers.Contract(nameData.pfpAddress, pfpInterface, signer.value);
            metadata = await pfpContract.tokenURI(nameData.tokenId);
          } else {
            // get contract image for that token ID
            metadata = await contract.tokenURI(nameData.tokenId);
          }

          if (metadata.includes("ipfs://")) {
            metadata = metadata.replace("ipfs://", "https://ipfs.io/ipfs/");
          }
          
          if (metadata.includes("http")) {
            const response = await fetch(metadata);
            const result = await response.json();

            if (result && result.image) {
              if (result.image.includes("ipfs://")) {
                commit("setSelectedNameImageSvg", result.image.replace("ipfs://", "https://ipfs.io/ipfs/"));
              } else {
                commit("setSelectedNameImageSvg", result.image);
              }
            } else {
              commit("setSelectedNameImageSvg", null);
            }
          } else if (metadata) {
            const json = atob(metadata.substring(29));
            const result = JSON.parse(json);

            if (result && result.image) {
              commit("setSelectedNameImageSvg", result.image);
            } else {
              commit("setSelectedNameImageSvg", null);
            }
            
          } else {
            commit("setSelectedNameImageSvg", null);
          }
        }
      }
      
    }
  }

};