package myapp.ctf.client;


import myapp.ctf.client.PrettyPrinter;

import com.ctf.stockapp.common.protocol.Request;
import com.ctf.stockapp.common.protocol.Response;
import java.io.IOException;
import java.io.ObjectInputStream;
import java.io.ObjectOutputStream;
import java.net.Socket;

import java.util.Collection;
import java.util.Map;
import java.util.Arrays;

public class ServerConnection {
  private String host;
  
  private int port;
  
  private Socket socket;
  private ObjectOutputStream out;
  private ObjectInputStream in;
  
  public ServerConnection(String host, int port) {
    this.host = host;
    this.port = port;
  }
  
  public void connect() throws IOException {
    this.socket = new Socket(this.host, this.port);
    this.out = new ObjectOutputStream(this.socket.getOutputStream());
    this.out.flush();
    this.in = new ObjectInputStream(this.socket.getInputStream());
  }
  
  public Response sendRequest(Request request) throws IOException, ClassNotFoundException {
    if (this.socket == null || !this.socket.isConnected())
      connect(); 
    this.out.writeObject(request);
    this.out.flush();
    Object response = null;
    try {
      response = this.in.readObject();
    } catch (IOException e) {
      int a = this.in.available();
      if (a == 0) {
        System.out.println("[FAILED RX] No data to read (was the pipe broken)");
        return new Response(false, "[FAILED RX] No data to read (was the pipe broken)");
      }
      throw e;
    }
    if (response instanceof Response) {
        Response typed = (Response) response;

        System.out.println("[RX] success=" + typed.isSuccess()
                + " message=" + typed.getMessage()
                + " data=" + PrettyPrinter.toJson(typed.getData()));
      return (Response)response;
    }
    throw new IOException("Invalid response from server");
  }
  
  public void disconnect() {
    try {
      if (this.in != null)
        this.in.close(); 
      if (this.out != null)
        try {
          Object response = this.in.readObject();
          if (response instanceof Response) {
              System.out.println("Received response on logout: " + response.toString());
          } else {
              System.out.println("Received unknown object on logout: " + response.toString());
          }
        } catch (Exception e) {
          System.out.println("Disconnected with no logout data");
        }
        this.out.close(); 
      if (this.socket != null)
        this.socket.close(); 
    } catch (IOException e) {
      e.printStackTrace();
    } 
  }
}
