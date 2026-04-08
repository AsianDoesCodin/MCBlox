package com.mcblox.mod;

import com.google.gson.Gson;
import com.google.gson.JsonObject;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.screens.*;
import net.minecraft.client.multiplayer.ServerData;
import net.minecraft.client.multiplayer.resolver.ServerAddress;
import net.minecraft.network.chat.Component;
import net.minecraft.world.level.storage.LevelStorageSource;
import net.minecraft.world.level.storage.LevelSummary;
import net.minecraftforge.client.event.ScreenEvent;
import net.minecraftforge.common.MinecraftForge;
import net.minecraftforge.eventbus.api.SubscribeEvent;
import net.minecraftforge.fml.common.Mod;
import net.minecraftforge.fml.loading.FMLPaths;

import java.io.File;
import java.io.FileReader;

@Mod("mcblox")
public class McBloxMod {

    private static McBloxConfig config = null;
    private static boolean skipAttempted = false;

    public McBloxMod() {
        config = loadConfig();
        if (config != null) {
            MinecraftForge.EVENT_BUS.register(this);
        }
    }

    private static McBloxConfig loadConfig() {
        File configFile = new File(FMLPaths.GAMEDIR.get().toFile(), "mcblox_config.json");
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

    // Intercept TitleScreen BEFORE it opens — cancel it and auto-join
    @SubscribeEvent
    public void onScreenOpen(ScreenEvent.Opening event) {
        if (skipAttempted || config == null) return;
        if (!(event.getScreen() instanceof TitleScreen)) return;

        skipAttempted = true;
        Minecraft mc = Minecraft.getInstance();

        if ("server".equals(config.gameType) && config.serverAddress != null) {
            event.setCanceled(true);
            ServerAddress addr = ServerAddress.parseString(config.serverAddress);
            ServerData serverData = new ServerData("McBlox Server", config.serverAddress, false);
            mc.tell(() -> {
                try {
                    ConnectScreen.startConnecting(new TitleScreen(), mc, addr, serverData, false);
                } catch (Exception e) {
                    e.printStackTrace();
                    skipAttempted = false;
                    mc.setScreen(new TitleScreen());
                }
            });
        } else if ("world".equals(config.gameType) && config.worldName != null) {
            // Verify the world exists before skipping
            try {
                LevelStorageSource levelSource = mc.getLevelSource();
                boolean worldExists = false;
                for (LevelSummary summary : levelSource.loadLevelSummaries(levelSource.findLevelCandidates()).join()) {
                    if (summary.getLevelId().equals(config.worldName)) {
                        worldExists = true;
                        break;
                    }
                }
                if (!worldExists) {
                    skipAttempted = false;
                    return; // Show normal title screen
                }
            } catch (Exception e) {
                skipAttempted = false;
                return;
            }

            event.setCanceled(true);
            mc.tell(() -> {
                try {
                    mc.createWorldOpenFlows().loadLevel(event.getScreen(), config.worldName);
                } catch (Exception e) {
                    e.printStackTrace();
                    skipAttempted = false;
                    mc.setScreen(new TitleScreen());
                }
            });
        }
    }

    // Replace Disconnect/Save-and-Quit button with Exit Game
    @SubscribeEvent
    public void onScreenInit(ScreenEvent.Init.Post event) {
        if (config == null) return;
        if (!(event.getScreen() instanceof PauseScreen)) return;

        for (var widget : event.getListenersList()) {
            if (widget instanceof Button btn) {
                String msg = btn.getMessage().getString();
                if (msg.contains("Disconnect") || msg.contains("Save and Quit")
                        || msg.contains("disconnect") || msg.contains("quit")) {
                    event.removeListener(btn);
                    event.addListener(Button.builder(
                            Component.literal("Exit Game"),
                            b -> Minecraft.getInstance().stop()
                    ).bounds(btn.getX(), btn.getY(), btn.getWidth(), btn.getHeight()).build());
                    break;
                }
            }
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
