import React, { useEffect, useState } from 'react';
import { NativeEventEmitter, NativeModules } from 'react-native';
import { SafeAreaView, Text, View, TextInput, Button, ScrollView } from 'react-native';

// DjiBridge native module is expected to be implemented natively
const { DjiBridge } = NativeModules as any;
const emitter = new NativeEventEmitter(DjiBridge);

export default function App() {
  const [missionUrl, setMissionUrl] = useState('');
  const [log, setLog] = useState<string[]>([]);

  useEffect(() => {
    const subs = [
      emitter.addListener('dji:registered', (e: any) => push(`registered: ${JSON.stringify(e)}`)),
      emitter.addListener('dji:productChanged', (e: any) => push(`product: ${JSON.stringify(e)}`)),
      emitter.addListener('dji:telemetry', (e: any) => push(`telemetry: ${JSON.stringify(e)}`)),
      emitter.addListener('dji:missionProgress', (e: any) => push(`progress: ${JSON.stringify(e)}`)),
      emitter.addListener('dji:missionComplete', (e: any) => push(`complete: ${JSON.stringify(e)}`)),
      emitter.addListener('dji:photoTaken', (e: any) => push(`photo: ${JSON.stringify(e)}`)),
    ];
    return () => subs.forEach(s => s.remove());
  }, []);

  const push = (s: string) => setLog(prev => [s, ...prev].slice(0, 200));

  const register = async () => { await DjiBridge.register(); };
  const connect = async () => { await DjiBridge.connect(); };
  const start = async () => {
    try {
      if (!missionUrl) return;
      const res = await fetch(missionUrl);
      const mission = await res.json();
      await DjiBridge.loadMission(mission);
      await DjiBridge.startMission();
    } catch (e) { push(`error: ${String(e)}`); }
  };

  return (
    <SafeAreaView>
      <View style={{ padding: 12 }}>
        <Text style={{ fontWeight: 'bold', fontSize: 18 }}>HyTech Field</Text>
        <View style={{ height: 8 }} />
        <Button title="Register" onPress={register} />
        <View style={{ height: 8 }} />
        <Button title="Connect" onPress={connect} />
        <View style={{ height: 8 }} />
        <TextInput placeholder="Mission Export URL" value={missionUrl} onChangeText={setMissionUrl} autoCapitalize='none' style={{ borderWidth: 1, padding: 8 }} />
        <View style={{ height: 8 }} />
        <Button title="Start Mission" onPress={start} />
        <View style={{ height: 12 }} />
        <Text style={{ fontWeight: 'bold' }}>Log</Text>
        <ScrollView style={{ height: 300 }}>
          {log.map((l, i) => <Text key={i} style={{ fontFamily: 'Courier' }}>{l}</Text>)}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}
