import { Chatbox } from '@talkjs/react-components';
import '@talkjs/react-components/default.css';

function Chat() {
  const appId = 't4J5woDb';

  return (
    <Chatbox
      // @ts-ignore
      host="durhack.talkjs.com"
      style={{ width: '400px', height: '600px' }}
      appId={appId}
      userId="sample_user_alice"
      conversationId="sample_conversation"
    />
  );
}
export default Chat