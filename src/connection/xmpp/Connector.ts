import Account from '../../Account'
import Roster from '../../ui/Roster'
import PersistentMap from '../../util/PersistentMap'
import Log from '../../util/Log'
import JID from '../../JID'
import * as ConnectHelper from './ConnectHelper'
import StorageConnection from '../storage/Connection'
import XMPPConnection from './Connection'

export default class Connector {
   private connectionParameters;

   private connectionArgs:string[];

   constructor(account:Account, boshUrl: string, jid: string, sid: string, rid:string);
   constructor(account:Account, boshUrl: string, jid: string, password: string);
   constructor(account:Account);
   constructor(private account:Account, ...connectionArgs:string[]) {
      let storage = account.getStorage();
      this.connectionParameters = new PersistentMap(storage, 'connection');

      connectionArgs = connectionArgs.filter(arg => typeof arg === 'string');

      if (connectionArgs.length < 3) {
         this.connectionArgs = [
            this.connectionParameters.get('url'),
            this.connectionParameters.get('jid'),
            this.connectionParameters.get('sid'),
            this.connectionParameters.get('rid')
         ];
      } else if (connectionArgs.length === 3 || connectionArgs.length === 4) {
         this.connectionArgs = connectionArgs;

         this.connectionParameters.remove('inactivity');
         this.connectionParameters.remove('timestamp');
      } else {
         throw 'Unsupported number of arguments';
      }
   }

   public connect() {
      let inactivity = this.connectionParameters.get('inactivity');
      let timestamp = this.connectionParameters.get('timestamp');
      let isConnectionExpired = inactivity && timestamp && (new Date()).getTime() - timestamp > inactivity;

      if (isConnectionExpired) {
         Log.warn('Credentials expired')

         this.account.closeAllChatWindows();

         return Promise.reject('Credentials expired');
      }

      Roster.get().startProcessing('Connecting...'); //@TODO remove on error

      return ConnectHelper.login.apply(this, this.connectionArgs)
         .then(this.successfulConnected);
   }

   public getJID():JID {
      return new JID(this.connectionParameters.get('jid'));
   }

   private successfulConnected = (data) => {
      let stropheConnection = data.connection;
      let status = data.status;

      this.storeConnectionParameters(stropheConnection);
      this.addDisconnectHandler(stropheConnection);
      this.addRidHandler(stropheConnection);

      let accountConnection = this.account.getConnection();
      let handlers = (<StorageConnection> accountConnection).getHandlers(); //@TODO fix connection interface

      accountConnection.close();
      accountConnection = new XMPPConnection(this.account, stropheConnection);

      for (let handler of handlers) {
         accountConnection.registerHandler.apply(accountConnection, handler);
      }

      if (stropheConnection.features) {
         this.storeConnectionFeatures(stropheConnection);
      }

      Log.debug('XMPP connection ready');

      Roster.get().endProcessing();

      return [status, accountConnection];
   }

   private storeConnectionParameters(connection) {
      this.connectionParameters.set({
         url: connection.service,
         jid: connection.jid,
         sid: connection._proto.sid,
         rid: connection._proto.rid,
         timestamp: (new Date()).getTime()
      });

      if (connection._proto.inactivity) {
         let inactivity = connection._proto.inactivity * 1000;

         this.connectionParameters.set('inactivity', inactivity);
      }
   }

   private addDisconnectHandler(connection) {
      connection.connect_callback = (status) => {
         if (status === Strophe.Status.DISCONNECTED) {
            this.account.connectionDisconnected();
         }
      }
   }

   private addRidHandler(connection) {
      connection.nextValidRid = (rid) => {
         let timestamp = (new Date()).getTime();

         this.connectionParameters.set('timestamp', timestamp);
         this.connectionParameters.set('rid', rid);
      };
   }

   private storeConnectionFeatures(connection) {
      let from = new JID('', connection.domain, '');
      let stanza = connection.features;

      let capsElement = stanza.querySelector('c');
      let ver = capsElement.getAttribute('ver');
      let node = capsElement.getAttribute('node');

      let discoInfoRepository = this.account.getDiscoInfoRepository();
      discoInfoRepository.addRelation(from, ver);
   }
}
