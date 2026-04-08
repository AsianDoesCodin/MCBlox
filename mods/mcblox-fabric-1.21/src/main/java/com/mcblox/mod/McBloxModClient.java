package com.mcblox.mod;

import com.google.gson.Gson;
import com.google.gson.JsonObject;
import net.fabricmc.api.ClientModInitializer;

import java.io.File;
import java.io.FileReader;

public class McBloxModClient implements ClientModInitializer {

    public static McBloxConfig config = null;
    public static boolean skipAttempted = false;

    @Override
    public void onInitializeClient() {
        config = loadConfig();
    }

    public static McBloxConfig loadConfig() {
        File configFile = new File("mcblox_config.json");
        if (!configFile.exists()) return null;
        try (FileReader reader = new FileReader(configFile)) {
            JsonObject json = new Gson().fromJson(reader, JsonObject.class);
            McBloxConfig cfg = new McBloxConfig();
            cfg.gameType = getStr(json, "game_type", "server");
            cfg.serverAddress = getStr(json, "server_address", null);
            cfg.worldName = getStr(json, "world_name", null);
            return cfg;
        } catch (Exception e) {
            e.printStackTrace();
            return null;
        }
    }

    private static String getStr(JsonObject json, String key, String def) {
        if (!json.has(key) || json.get(key).isJsonNull()) return def;
        return json.get(key).getAsString();
    }

    public static class McBloxConfig {
        public String gameType;
        public String serverAddress;
        public String worldName;
    }
}
