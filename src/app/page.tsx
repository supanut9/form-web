import { Card, Center, Stack, Text, Title } from "@mantine/core";

export default function HomePage() {
  return (
    <Center h="100vh" p="md">
      <Card shadow="sm" padding="xl" radius="md" withBorder maw={480} w="100%">
        <Stack gap="sm">
          <Title order={3}>Form Renderer</Title>
          <Text c="dimmed" size="sm">
            This is the public-facing form renderer for the form service. Direct
            links to forms are at{" "}
            <code>/f/:slug</code> (link share) and{" "}
            <code>/e/:eventKey</code> (event-keyed entry). Embedded forms are
            served from <code>/embed/:formId</code>.
          </Text>
        </Stack>
      </Card>
    </Center>
  );
}
