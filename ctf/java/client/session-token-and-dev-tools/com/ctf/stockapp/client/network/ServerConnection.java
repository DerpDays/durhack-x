package com.ctf.stockapp.client.network;

import com.ctf.stockapp.common.protocol.*;

import java.io.*;
import java.net.Socket;

public class ServerConnection {
    private static final String DEFAULT_HOST = "localhost";
    private static final int DEFAULT_PORT = 9999;
    private static final boolean DEBUG = Boolean.parseBoolean(
        System.getProperty("stockapp.debug", "true"));

    private String host;
    private int port;
    private Socket socket;
    private ObjectOutputStream out;
    private ObjectInputStream in;

    public ServerConnection() {
        this(DEFAULT_HOST, DEFAULT_PORT);
    }

    public ServerConnection(String host, int port) {
        this.host = host;
        this.port = port;
    }

    public void connect() throws IOException {
        socket = new Socket(host, port);
        out = new ObjectOutputStream(socket.getOutputStream());
        out.flush();
        in = new ObjectInputStream(socket.getInputStream());
    }

    public Response sendRequest(Request request) throws IOException, ClassNotFoundException {
        if (socket == null || !socket.isConnected()) {
            connect();
        }
        
        if (DEBUG && request != null) {
            log("[TX] " + request.getClass().getSimpleName()
                + " token=" + request.getSessionToken());
        }

        out.writeObject(request);
        out.flush();
        
        Object response = in.readObject();
        if (response instanceof Response) {
            Response typed = (Response) response;
            if (DEBUG) {
                Object data = typed.getData();
                String dataInfo = (data == null) ? "null" : data.getClass().getName();
                log("[RX] success=" + typed.isSuccess()
                    + " message=" + typed.getMessage()
                    + " data=" + dataInfo);
            }
            return typed;
        }
        throw new IOException("Invalid response from server");
    }

    public void disconnect() {
        try {
            if (in != null) in.close();
            if (out != null) out.close();
            if (socket != null) socket.close();
        } catch (IOException e) {
            e.printStackTrace();
        }
    }

    public void setHost(String host) {
        this.host = host;
    }

    public void setPort(int port) {
        this.port = port;
    }

    private void log(String message) {
        if (DEBUG) {
            System.out.println("[StockClient] " + message);
        }
    }
}
