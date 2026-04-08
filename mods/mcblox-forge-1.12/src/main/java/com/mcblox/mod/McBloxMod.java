package com.mcblox.mod;

import com.google.gson.Gson;
import com.google.gson.JsonObject;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiButton;
import net.minecraft.client.gui.GuiIngameMenu;
import net.minecraft.client.gui.GuiMainMenu;
import net.minecraft.client.gui.GuiScreen;
import net.minecraft.client.multiplayer.GuiConnecting;
import net.minecraft.client.multiplayer.ServerData;
import net.minecraftforge.client.event.GuiOpenEvent;
import net.minecraftforge.client.event.GuiScreenEvent;
import net.minecraftforge.common.MinecraftForge;
import net.minecraftforge.fml.common.Mod;
import net.minecraftforge.fml.common.event.FMLInitializationEvent;
import net.minecraftforge.fml.common.eventhandler.SubscribeEvent;
import net.minecraftforge.fml.common.gameevent.TickEvent;

import java.io.File;
import java.io.FileReader;

@Mod(modid = "mcblox", name = "McBlox", version = "1.0.0", clientSideOnly = true)
public class McBloxMod {

    private static McBloxConfig config = null;
    private static boolean skipAttempted = false;

    @Mod.EventHandler
    public void init(FMLInitializationEvent event) {
        config = loadConfig();
        if (config != null) {
            MinecraftForge.EVENT_BUS.register(this);
        }
    }

    private static McBloxConfig loadConfig() {
        File gameDir = Minecraft.getMinecraft().gameDir;
        File configFile = new File(gameDir, "mcblox_config.json");
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

    // Intercept main menu before it opens
    @SubscribeEvent
    public void onGuiOpen(GuiOpenEvent event) {
        if (skipAttempted || config == null) return;
        if (!(event.getGui() instanceof GuiMainMenu)) return;

        skipAttempted = true;
        Minecraft mc = Minecraft.getMinecraft();

        if ("server".equals(config.gameType) && config.serverAddress != null) {
            ServerData serverData = new ServerData("McBlox Server", config.serverAddress, false);
            event.setGui(new GuiConnecting(new GuiMainMenu(), mc, serverData));
        } else if ("world".equals(config.gameType) && config.worldName != null) {
            // Can't cancel+schedule during init; let menu show then load on first tick
            pendingWorldLoad = true;
        }
    }

    private static boolean pendingWorldLoad = false;

    @SubscribeEvent
    public void onClientTick(TickEvent.ClientTickEvent event) {
        if (event.phase != TickEvent.Phase.END || !pendingWorldLoad) return;
        pendingWorldLoad = false;
        Minecraft mc = Minecraft.getMinecraft();
        try {
            mc.launchIntegratedServer(config.worldName, config.worldName, null);
        } catch (Exception e) {
            e.printStackTrace();
            skipAttempted = false;
            mc.displayGuiScreen(new GuiMainMenu());
        }
    }

    @SubscribeEvent
    public void onGuiInit(GuiScreenEvent.InitGuiEvent.Post event) {
        if (config == null) return;
        if (!(event.getGui() instanceof GuiIngameMenu)) return;

        for (Object widget : event.getButtonList()) {
            if (widget instanceof GuiButton) {
                GuiButton btn = (GuiButton) widget;
                if (btn.displayString.contains("Disconnect") || btn.displayString.contains("Save and Quit")
                        || btn.displayString.contains("disconnect") || btn.displayString.contains("quit")) {
                    event.getButtonList().remove(btn);
                    GuiButton exitBtn = new GuiButton(9999, btn.x, btn.y, btn.width, btn.height, "Exit Game");
                    event.getButtonList().add(exitBtn);
                    break;
                }
            }
        }
    }

    @SubscribeEvent
    public void onGuiAction(GuiScreenEvent.ActionPerformedEvent.Pre event) {
        if (config == null) return;
        if (event.getGui() instanceof GuiIngameMenu && event.getButton().id == 9999) {
            Minecraft.getMinecraft().shutdown();
            event.setCanceled(true);
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
