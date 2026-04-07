package com.mcblox.mod;

import com.google.gson.Gson;
import com.google.gson.JsonObject;
import net.fabricmc.api.ClientModInitializer;

import java.io.File;
import java.io.FileReader;

public class McBloxModClient implements ClientModInitializer {

    public static McBloxConfig config = null;
    public static boolean autoJoinDone = false;
    public static int tickDelay = 0;

    @Override
    public void onInitializeClient() {
        config = loadConfig();
    }

    public static McBloxConfig loadConfig() {
        File configFile = new File("mcblox_config.json");
        if (!configFile.exists()) {
            return null;
        }
        try (FileReader reader = new FileReader(configFile)) {
            JsonObject json = new Gson().fromJson(reader, JsonObject.class);
            McBloxConfig cfg = new McBloxConfig();
            cfg.gameType = json.has("game_type") ? json.get("game_type").getAsString() : "server";
            cfg.serverAddress = json.has("server_address") ? json.get("server_address").getAsString() : null;
            cfg.worldName = json.has("world_name") ? json.get("world_name").getAsString() : null;
            return cfg;
        } catch (Exception e) {
            e.printStackTrace();
            return null;
        }
    }

    public static class McBloxConfig {
        public String gameType;
        public String serverAddress;
        public String worldName;
    }
}
