package com.mcblox.mod;

import com.google.gson.Gson;
import com.google.gson.JsonObject;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.screens.*;
import net.minecraft.client.multiplayer.ServerData;
import net.minecraft.client.multiplayer.resolver.ServerAddress;
import net.minecraft.network.chat.TextComponent;
import net.minecraftforge.client.event.ScreenOpenEvent;
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
            cfg.gameType = json.has("game_type") ? json.get("game_type").getAsString() : "server";
            cfg.serverAddress = json.has("server_address") ? json.get("server_address").getAsString() : null;
            cfg.worldName = json.has("world_name") ? json.get("world_name").getAsString() : null;
            return cfg;
        } catch (Exception e) {
            e.printStackTrace();
            return null;
        }
    }

    // 1.18.2 uses ScreenOpenEvent to intercept screen opens
    @SubscribeEvent
    public void onScreenOpen(ScreenOpenEvent event) {
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
                    ConnectScreen.startConnecting(new TitleScreen(), mc, addr, serverData);
                } catch (Exception e) {
                    e.printStackTrace();
                    skipAttempted = false;
                    mc.setScreen(new TitleScreen());
                }
            });
        } else if ("world".equals(config.gameType) && config.worldName != null) {
            event.setCanceled(true);
            mc.tell(() -> {
                try {
                    mc.loadLevel(config.worldName);
                } catch (Exception e) {
                    e.printStackTrace();
                    skipAttempted = false;
                    mc.setScreen(new TitleScreen());
                }
            });
        }
    }

    @SubscribeEvent
    public void onScreenInit(ScreenEvent.InitScreenEvent.Post event) {
        if (config == null) return;
        if (!(event.getScreen() instanceof PauseScreen)) return;

        for (var widget : event.getListenersList()) {
            if (widget instanceof Button btn) {
                String msg = btn.getMessage().getString();
                if (msg.contains("Disconnect") || msg.contains("Save and Quit")
                        || msg.contains("disconnect") || msg.contains("quit")) {
                    event.removeListener(btn);
                    event.addListener(new Button(btn.x, btn.y, btn.getWidth(), btn.getHeight(),
                        new TextComponent("Save and Quit"), b -> Minecraft.getInstance().stop()));
                    break;
                }
            }
        }
    }

    public static class McBloxConfig {
        public String gameType;
        public String serverAddress;
        public String worldName;
    }
}
