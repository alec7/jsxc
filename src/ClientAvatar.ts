import { IContact } from './Contact.interface'
import AvatarSet from './ui/AvatarSet'
import Client from './Client'
import Account from './Account'
import Storage from './Storage'
import { Strophe } from './vendor/Strophe'

enum TYPE {
   PLACEHOLDER, IMAGE
};

const KEY_SOURCE_ACCOUNT = 'clientAvatar';
const KEY_TYPE = 'clientAvatarType';
const KEY_SESSION_FLAG = 'clientAvatar';

export default class ClientAvatar {
   private static instance;

   public static get(): ClientAvatar {
      if (!ClientAvatar.instance) {
         ClientAvatar.instance = new ClientAvatar(Client.getStorage());
      }

      return ClientAvatar.instance;
   }

   private elements = [];
   private contact;

   private constructor(private storage: Storage) {
      let accountIds = storage.getItem('accounts') || []; //@REVIEW maybe client function?

      if (accountIds.length === 0) {
         this.reset();
      }

      storage.registerHook('accounts', (newValue) => {
         if ((newValue || []).length === 0) {
            this.reset();
         }
      });

      storage.registerHook(KEY_SOURCE_ACCOUNT, (sourceAccountUid, oldValue) => {
         if (sourceAccountUid) {
            let account = Client.getAccount(sourceAccountUid);

            if (account.getSessionStorage().getItem(KEY_SESSION_FLAG)) {
               this.setSourceContact(account.getContact());
            } else {
               this.reset();
            }
         } else if (oldValue) {
            this.reset();
         }
      });
   }

   private reset() {
      this.storage.removeItem(KEY_SOURCE_ACCOUNT);
      this.storage.removeItem(KEY_TYPE);

      AvatarSet.clear(this.elements);
   }

   public registerAccount(account: Account) {
      if (this.getSourceAccountUid() === account.getUid()) {
         if (account.getSessionStorage().getItem(KEY_SESSION_FLAG)) {
            this.setSourceContact(account.getContact());
         } else {
            this.reset();
         }
      }

      account.registerConnectionHook((status, condition) => {
         if (status === Strophe.Status.CONNECTED || status === Strophe.Status.ATTACHED) {
            account.getContact().getAvatar().then(avatar => {
               if (!this.getSourceAccountUid() || this.getCurrentType() === TYPE.PLACEHOLDER) {
                  this.setSourceAccount(account, TYPE.IMAGE);
               }
            }).catch(() => {
               if (!this.getSourceAccountUid()) {
                  this.setSourceAccount(account);
               }
            })
         }

         //@TODO update avatar if account goes offline (multi account setup)
      });
   }

   private setSourceAccount(account, type = TYPE.PLACEHOLDER) {
      this.storage.setItem(KEY_SOURCE_ACCOUNT, account.getUid());
      this.storage.getItem(KEY_TYPE, type + '');

      account.getSessionStorage().setItem(KEY_SESSION_FLAG, true);
   }

   private getSourceAccountUid(): string {
      return this.storage.getItem(KEY_SOURCE_ACCOUNT);
   }

   private getCurrentType(): TYPE {
      return parseInt(this.storage.getItem(KEY_TYPE));
   }

   private setSourceContact(contact: IContact) {
      if (this.contact !== contact) {
         for (let element of this.elements) {
            AvatarSet.get(contact).addElement(element);
         }
      }

      this.contact = contact;
   }

   public addElement(element) {
      this.elements.push(element);

      if (this.contact) {
         AvatarSet.get(this.contact).addElement(element);
      }
   }
}
